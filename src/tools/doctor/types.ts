/**
 * Matrix Doctor Types
 */

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  autoFixable: boolean;
  fixed?: boolean;
  fixAction?: string;
}

export interface DoctorResult {
  healthy: boolean;
  checks: DiagnosticCheck[];
  environment: {
    os: string;
    bunVersion: string;
    matrixDir: string;
    configPath: string;
    dbPath: string;
  };
  suggestions: string[];
  issueTemplate?: string;
}

export interface DoctorInput {
  autoFix?: boolean;
}
