use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const LIMIT_PER_HUNK: usize = 100_000;
const LIMIT_TOTAL_LINES: usize = 1_000_000;
const LIMITATION: &str = "PASS only means no changed-line diagnostics in the supplied ESLint JSON; ESLint rule configuration and CI execution are not independently verified.";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub patch: String,
    pub eslint_report: Vec<LintReport>,
    pub cwd: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintReport {
    pub file_path: String,
    pub messages: Vec<LintMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintMessage {
    pub line: Option<usize>,
    #[serde(default)]
    pub fatal: bool,
    pub severity: Option<u8>,
    pub rule_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub file: String,
    pub line: Option<usize>,
    pub rule_id: Option<String>,
    pub severity: &'static str,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub status: &'static str,
    pub checked_files: Vec<String>,
    pub missing_files: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub limitation: &'static str,
}

fn normal_path(raw: &str) -> Option<String> {
    let raw = raw.replace('\\', "/");
    if raw.starts_with('/') || raw.contains('\0') || raw.contains(":/") {
        return None;
    }

    let mut parts = Vec::new();
    for part in raw.split('/') {
        match part {
            "" | "." => continue,
            ".." => return None,
            other => parts.push(other),
        }
    }

    if parts.is_empty() {
        return None;
    }

    Some(parts.join("/"))
}

fn relative_report_path(file: &str, cwd: &str) -> Option<String> {
    let name = file.replace('\\', "/");
    if !name.starts_with('/') {
        return normal_path(&name);
    }

    let root = cwd.replace('\\', "/");
    let root = root.trim_end_matches('/');
    let remainder = name.strip_prefix(root)?.strip_prefix('/')?;
    normal_path(remainder)
}

fn parse_patch(patch: &str) -> Result<Vec<(String, BTreeSet<usize>)>, String> {
    let mut files: Vec<(String, BTreeSet<usize>)> = Vec::new();
    let mut active: Option<usize> = None;
    let mut total = 0usize;

    for line in patch.lines() {
        let line = line.trim_end_matches('\r');

        if line.starts_with("diff --git ") {
            active = None;
            continue;
        }

        if let Some(name) = line.strip_prefix("+++ b/") {
            let name = normal_path(name).ok_or("Invalid diff file path")?;
            let index = match files.iter().position(|(path, _)| path == &name) {
                Some(i) => i,
                None => {
                    files.push((name, BTreeSet::new()));
                    files.len() - 1
                }
            };

            active = Some(index);
            continue;
        }

        if line == "+++ /dev/null" {
            active = None;
            continue;
        }

        let Some(index) = active else { continue };
        if !line.starts_with("@@ ") {
            continue;
        }

        let token = line
            .split_whitespace()
            .find(|token| token.starts_with('+'))
            .ok_or("Missing Git diff hunk start")?;
        let (start, count) = match token[1..].split_once(',') {
            Some((start, count)) => (
                start.parse::<usize>().map_err(|_| "Invalid hunk start")?,
                count.parse::<usize>().map_err(|_| "Invalid hunk count")?,
            ),
            None => (
                token[1..].parse::<usize>().map_err(|_| "Invalid hunk start")?,
                1,
            ),
        };

        if count > LIMIT_PER_HUNK || total.checked_add(count).filter(|n| *n <= LIMIT_TOTAL_LINES).is_none() {
            return Err("Git diff too large".into());
        }

        let end = start.checked_add(count).ok_or("Git diff hunk overflow")?;
        total += count;

        for changed_line in start..end {
            files[index].1.insert(changed_line);
        }
    }

    Ok(files)
}

fn is_source_file(name: &str) -> bool {
    [".js", ".jsx", ".ts", ".tsx", ".mjs", ".mts", ".cjs", ".cts"]
        .iter()
        .any(|ext| name.ends_with(ext))
}

pub fn inspect(request: &Request) -> Result<Inspection, String> {
    let files = parse_patch(&request.patch)?;
    let source_files: Vec<_> = files
        .iter()
        .filter(|(name, changes)| is_source_file(name) && !changes.is_empty())
        .collect();

    if source_files.is_empty() {
        return Ok(Inspection {
            status: "NOT_APPLICABLE",
            checked_files: Vec::new(),
            missing_files: Vec::new(),
            diagnostics: Vec::new(),
            limitation: LIMITATION,
        });
    }

    let mut checked_files = Vec::new();
    let mut missing_files = Vec::new();
    let mut diagnostics = Vec::new();

    for (file, changed_lines) in source_files {
        let messages = request
            .eslint_report
            .iter()
            .filter(|report| relative_report_path(&report.file_path, &request.cwd).as_deref() == Some(file))
            .last()
            .map(|report| &report.messages);

        let Some(messages) = messages else {
            missing_files.push(file.clone());
            continue;
        };

        checked_files.push(file.clone());

        for issue in messages {
            let in_scope = issue.fatal || issue.line.is_some_and(|line| {
                changed_lines.contains(&line) || line.checked_sub(1).is_some_and(|n| changed_lines.contains(&n))
            });
            if !in_scope {
                continue;
            }

            diagnostics.push(Diagnostic {
                file: file.clone(),
                line: issue.line,
                rule_id: issue.rule_id.clone(),
                severity: if issue.fatal || issue.severity == Some(2) { "error" } else { "warning" },
                message: issue.message.clone().unwrap_or_else(|| "Unspecified diagnostic".into()),
            });
        }
    }

    let status = if !missing_files.is_empty() {
        "NOT_RUN"
    } else if diagnostics.iter().any(|diagnostic| diagnostic.severity == "error") {
        "FIX_REQUIRED"
    } else if diagnostics.is_empty() {
        "PASS"
    } else {
        "WARN"
    };

    Ok(Inspection { status, checked_files, missing_files, diagnostics, limitation: LIMITATION })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(patch: &str, messages: Vec<LintMessage>) -> Request {
        Request {
            patch: patch.to_string(),
            cwd: "/tmp/project".to_string(),
            eslint_report: vec![LintReport {
                file_path: "/tmp/project/src/user.ts".to_string(),
                messages,
            }],
        }
    }

    fn issue(line: usize, severity: u8, fatal: bool) -> LintMessage {
        LintMessage { line: Some(line), severity: Some(severity), fatal, rule_id: Some("ksd/rule".into()), message: Some("Bad style".into()) }
    }

    #[test]
    fn flags_a_changed_line() {
        let input = request("diff --git a/src/user.ts b/src/user.ts\n+++ b/src/user.ts\n@@ -2,0 +3,2 @@\n+x\n+y\n", vec![issue(3, 2, false)]);
        let out = inspect(&input).unwrap();
        assert_eq!(out.status, "FIX_REQUIRED");
        assert_eq!(out.diagnostics.len(), 1);
    }

    #[test]
    fn ignores_an_unchanged_line() {
        let input = request("+++ b/src/user.ts\n@@ -2,0 +3,2 @@\n", vec![issue(33, 2, false)]);
        let out = inspect(&input).unwrap();
        assert_eq!(out.status, "PASS");
    }

    #[test]
    fn reports_missing_eslint_file_as_not_run() {
        let mut input = request("+++ b/src/user.ts\n@@ -0,0 +1 @@\n", vec![]);
        input.eslint_report.clear();
        assert_eq!(inspect(&input).unwrap().status, "NOT_RUN");
    }

    #[test]
    fn ignores_deletion_only_diff() {
        let input = request("+++ b/src/user.ts\n@@ -3,3 +3,0 @@\n", vec![]);
        assert_eq!(inspect(&input).unwrap().status, "NOT_APPLICABLE");
    }

    #[test]
    fn fatal_errors_cannot_be_hidden_by_scope() {
        let input = request("+++ b/src/user.ts\n@@ -0,0 +1 @@\n", vec![issue(999, 2, true)]);
        assert_eq!(inspect(&input).unwrap().status, "FIX_REQUIRED");
    }

    #[test]
    fn adjacent_line_warning_is_counted() {
        let input = request("+++ b/src/user.ts\n@@ -0,0 +5 @@\n", vec![issue(6, 1, false)]);
        assert_eq!(inspect(&input).unwrap().status, "WARN");
    }

    #[test]
    fn path_traversal_is_rejected() {
        let input = request("+++ b/../../secrets.ts\n@@ -0,0 +1 @@\n", vec![]);
        assert!(inspect(&input).is_err());
    }

    #[test]
    fn enormous_hunk_is_rejected() {
        let input = request("+++ b/src/user.ts\n@@ -0,0 +1,100001 @@\n", vec![]);
        assert!(inspect(&input).is_err());
    }

    #[test]
    fn ordering_matches_patch_source_order() {
        let input = request("+++ b/src/second.ts\n@@ -0,0 +1 @@\n+++ b/src/first.ts\n@@ -0,0 +1 @@\n", vec![]);
        let output = inspect(&input).unwrap();
        assert_eq!(output.status, "NOT_RUN");
        assert_eq!(output.missing_files, vec!["src/second.ts", "src/first.ts"]);
    }
}
