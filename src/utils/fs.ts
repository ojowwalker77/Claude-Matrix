/**
 * File I/O Abstraction
 *
 * Centralized file operations for consistent error handling and patterns.
 * Reduces scattered fs operations across the codebase.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  unlinkSync,
  type WriteFileOptions,
} from 'fs';
import { dirname, join } from 'path';

export interface FileIOOptions {
  /** Create parent directories if they don't exist */
  ensureDir?: boolean;
  /** File mode for write operations */
  mode?: number;
  /** Encoding for text operations */
  encoding?: BufferEncoding;
}

/**
 * FileIO - Unified file operations with consistent error handling
 */
export const FileIO = {
  /**
   * Check if a path exists
   */
  exists(path: string): boolean {
    return existsSync(path);
  },

  /**
   * Check if a path is a directory
   */
  isDirectory(path: string): boolean {
    try {
      return existsSync(path) && statSync(path).isDirectory();
    } catch {
      return false;
    }
  },

  /**
   * Check if a path is a file
   */
  isFile(path: string): boolean {
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  },

  /**
   * Read a text file
   */
  read(path: string, encoding: BufferEncoding = 'utf-8'): string | null {
    try {
      return readFileSync(path, encoding);
    } catch {
      return null;
    }
  },

  /**
   * Read a binary file
   */
  readBuffer(path: string): Buffer | null {
    try {
      return readFileSync(path);
    } catch {
      return null;
    }
  },

  /**
   * Write a text file
   */
  write(path: string, content: string, options: FileIOOptions = {}): boolean {
    try {
      if (options.ensureDir) {
        FileIO.ensureDir(dirname(path));
      }
      const writeOpts: WriteFileOptions = {};
      if (options.mode) writeOpts.mode = options.mode;
      if (options.encoding) writeOpts.encoding = options.encoding;
      writeFileSync(path, content, writeOpts);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Write a binary file
   */
  writeBuffer(path: string, content: Buffer, options: FileIOOptions = {}): boolean {
    try {
      if (options.ensureDir) {
        FileIO.ensureDir(dirname(path));
      }
      const writeOpts: WriteFileOptions = {};
      if (options.mode) writeOpts.mode = options.mode;
      writeFileSync(path, content, writeOpts);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Ensure a directory exists (creates recursively if needed)
   */
  ensureDir(path: string): boolean {
    try {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * List files in a directory
   */
  listDir(path: string): string[] {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },

  /**
   * Copy a file
   */
  copy(src: string, dest: string, options: FileIOOptions = {}): boolean {
    try {
      if (options.ensureDir) {
        FileIO.ensureDir(dirname(dest));
      }
      copyFileSync(src, dest);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Delete a file
   */
  delete(path: string): boolean {
    try {
      if (existsSync(path)) {
        unlinkSync(path);
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get file stats (returns null on error)
   */
  stat(path: string): ReturnType<typeof statSync> | null {
    try {
      return statSync(path);
    } catch {
      return null;
    }
  },

  /**
   * JSON-specific operations
   */
  json: {
    /**
     * Read and parse a JSON file
     */
    read<T = unknown>(path: string): T | null {
      const content = FileIO.read(path);
      if (content === null) return null;
      try {
        return JSON.parse(content) as T;
      } catch {
        return null;
      }
    },

    /**
     * Write an object as JSON
     */
    write(path: string, data: unknown, options: FileIOOptions & { pretty?: boolean } = {}): boolean {
      const content = options.pretty !== false
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
      return FileIO.write(path, content, options);
    },
  },
};

/**
 * Join paths safely
 */
export { join };

/**
 * Get directory name from path
 */
export { dirname };
