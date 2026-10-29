import type { ParsedProject } from 'data-explorer-core';
import type { MspProject } from './msp.js';
/** The config file, at the project root. A member of the project, but an unlabelled one. */
export declare const MSP_CONFIG = "msp_config.json";
/**
 * Whether this parsed project is a Managed Simulink Project, and what it adds.
 *
 * `configText` is `msp_config.json`'s bytes as text when the file is there — the caller
 * reads it, because only the app can touch a filesystem — and undefined when it is not.
 */
export declare function detectMsp(parsed: ParsedProject, configText?: string): MspProject | undefined;
