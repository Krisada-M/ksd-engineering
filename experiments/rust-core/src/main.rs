use std::io::{self, Read};
use std::process::ExitCode;

use ksd_rust_quality::{inspect, Request};

const MAX_INPUT_BYTES: u64 = 8 * 1024 * 1024;

fn run() -> Result<i32, String> {
    let mut raw = Vec::new();

    io::stdin()
        .take(MAX_INPUT_BYTES + 1)
        .read_to_end(&mut raw)
        .map_err(|error| format!("Cannot read stdin: {error}"))?;

    if raw.len() as u64 > MAX_INPUT_BYTES {
        return Err("Request exceeds 8 MiB".into());
    }

    let request: Request = serde_json::from_slice(&raw)
        .map_err(|error| format!("Invalid JSON request: {error}"))?;
    let result = inspect(&request)?;
    let encoded = serde_json::to_string(&result)
        .map_err(|error| format!("Cannot serialize output: {error}"))?;

    println!("{encoded}");

    match result.status {
        "FIX_REQUIRED" => Ok(1),
        "NOT_RUN" => Ok(2),
        _ => Ok(0),
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(0) => ExitCode::SUCCESS,
        Ok(exit_code) => ExitCode::from(exit_code as u8),
        Err(message) => {
            eprintln!("KSD Rust quality NOT RUN: {message}");
            ExitCode::from(2)
        }
    }
}
