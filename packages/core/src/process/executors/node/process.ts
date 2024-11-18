import { IFileSystem } from '../../../filesystem';
import { Process, ProcessEvent, ProcessState, ProcessType } from '../../base';
import { getQuickJS } from 'quickjs-emscripten';

export class NodeProcess extends Process {
    private fileSystem: IFileSystem;

    constructor(
        pid: number,
        executablePath: string,
        args: string[],
        fileSystem: IFileSystem,
    ) {
        super(pid, ProcessType.JAVASCRIPT, executablePath, args);
        this.fileSystem = fileSystem;
    }

    async execute(): Promise<void> {
        try {
            const QuickJS = await getQuickJS();
            const runtime = QuickJS.newRuntime();
            const context = runtime.newContext();

            // Set up module loader
            runtime.setModuleLoader((moduleName, ctx) => {
                try {
                    const resolvedPath = this.fileSystem.resolveModulePath(moduleName, this.executablePath);
                    const content = this.fileSystem.readFile(resolvedPath);

                    if (content === undefined) {
                        return { error: new Error(`Module not found: ${moduleName}`) };
                    }

                    return { value: content };
                } catch (error: any) {
                    return { error };
                }
            });

            // Set up console.log and other console methods
            const consoleObj = context.newObject();

            // Console.log
            const logFn = context.newFunction("log", (...args) => {
                const output = args.map(arg => context.dump(arg)).join(" ") + "\n";
                this.emit(ProcessEvent.MESSAGE, { stdout: output });
            });
            context.setProp(consoleObj, "log", logFn);

            // Console.error
            const errorFn = context.newFunction("error", (...args) => {
                const output = args.map(arg => context.dump(arg)).join(" ") + "\n";
                this.emit(ProcessEvent.MESSAGE, { stderr: output });
            });
            context.setProp(consoleObj, "error", errorFn);

            context.setProp(context.global, "console", consoleObj);

            // Clean up function handles
            logFn.dispose();
            errorFn.dispose();
            consoleObj.dispose();

            // Set up process.argv
            const processObj = context.newObject();
            const argvArray = context.newArray();

            const fullArgs = ['node', this.executablePath, ...this.args];
            for (let i = 0; i < fullArgs.length; i++) {
                const argHandle = context.newString(fullArgs[i]);
                context.setProp(argvArray, i, argHandle);
                argHandle.dispose();
            }

            context.setProp(processObj, 'argv', argvArray);
            context.setProp(context.global, 'process', processObj);

            argvArray.dispose();
            processObj.dispose();

            try {
                // Get the file content
                const content = this.fileSystem.readFile(this.executablePath);
                if (!content) {
                    throw new Error(`File not found: ${this.executablePath}`);
                }

                // Execute the code
                const result = context.evalCode(content, this.executablePath, { type: 'module' });

                // Handle any pending promises
                while (runtime.hasPendingJob()) {
                    const jobResult = runtime.executePendingJobs(10);
                    if (jobResult.error) {
                        throw context.dump(jobResult.error);
                    }
                }

                if (result.error) {
                    throw context.dump(result.error);
                }

                result.value.dispose();
                this._exitCode = 0;
                this._state = ProcessState.COMPLETED;
            } catch (error) {
                this._exitCode = 1;
                this._state = ProcessState.FAILED;
                this.emit(ProcessEvent.MESSAGE, { stderr: `${error}\n` });
            } finally {
                context.dispose();
                runtime.dispose();
                this.emit(ProcessEvent.EXIT, { pid: this.pid, exitCode: this._exitCode });
            }
        } catch (error: any) {
            this._state = ProcessState.FAILED;
            this._exitCode = 1;
            this.emit(ProcessEvent.ERROR, { pid: this.pid, error });
            this.emit(ProcessEvent.EXIT, { pid: this.pid, exitCode: this._exitCode });
        }
    }

    async terminate(): Promise<void> {
        if (this._state !== ProcessState.RUNNING) {
            return;
        }

        // this.running = false;
        this._state = ProcessState.TERMINATED;
        this._exitCode = -1;
        this.emit(ProcessEvent.EXIT, { pid: this.pid, exitCode: this._exitCode });
    }
}