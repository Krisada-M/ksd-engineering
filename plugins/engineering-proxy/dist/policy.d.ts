import { type KsdMode } from "./sdlc.js";
export declare const SECTION_KEY = "engineering-proxy";
export declare const POLICY_MARKER = "[Engineering Proxy Policy v0.3]";
export declare const POLICY_END = "[End Engineering Proxy Policy]";
export declare function buildPolicy({ enforcement }?: {
    enforcement?: KsdMode;
}): string;
interface AgentStartEvent {
    systemPromptOptions?: {
        sections?: Record<string, string | undefined>;
    };
    systemPrompt?: string | string[];
}
export declare function augmentSystemPrompt(event: AgentStartEvent | undefined, policy: string): {
    systemPrompt: string | string[];
} | undefined;
export {};
