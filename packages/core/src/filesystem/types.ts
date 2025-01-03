/**
 * export interface for file system operations
 */
export interface IFileSystem {
    writeFile(path: string, content: string): void;
    writeBuffer(path: string, buffer: Buffer): void;
    readFile(path: string): string | undefined;
    readBuffer(path: string): Buffer | undefined;
    deleteFile(path: string, recursive?: boolean): void;
    listFiles(basePath?: string): string[];
    resolvePath(path: string, basePath?: string): string;
    fileExists(path: string): boolean;
    resolveModulePath(specifier: string, basePath?: string): string;
    createDirectory(path: string): void;
    deleteDirectory(path: string): void;
    listDirectory(path: string): string[];
    isDirectory(path: string): boolean;
    normalizePath(path: string): string;
}
