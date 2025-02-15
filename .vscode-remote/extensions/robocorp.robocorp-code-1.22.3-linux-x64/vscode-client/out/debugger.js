"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDebugger = exports.RobocorpCodeDebugConfigurationProvider = void 0;
const path = require("path");
const fs = require("fs");
const vscode_1 = require("vscode");
const roboConfig = require("./robocorpSettings");
const channel_1 = require("./channel");
const activities_1 = require("./activities");
const robocorpCommands_1 = require("./robocorpCommands");
const extension_1 = require("./extension");
const pythonExtIntegration_1 = require("./pythonExtIntegration");
class RobocorpCodeDebugConfigurationProvider {
    provideDebugConfigurations(folder, token) {
        let configurations = [];
        configurations.push({
            "type": "robocorp-code",
            "name": "Robocorp Code: Launch task from robot.yaml",
            "request": "launch",
            "robot": '^"\\${file}"',
            "task": "",
        });
        return configurations;
    }
    async resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration, token) {
        let isActionPackageLaunch = false;
        let targetYaml;
        if (debugConfiguration.robot) {
            if (!fs.existsSync(debugConfiguration.robot)) {
                vscode_1.window.showWarningMessage('Error. Expected: specified "robot.yaml": ' + debugConfiguration.robot + " to exist.");
                return;
            }
            targetYaml = debugConfiguration.robot;
        }
        else if (debugConfiguration.package) {
            isActionPackageLaunch = true;
            if (!fs.existsSync(debugConfiguration.package)) {
                vscode_1.window.showWarningMessage('Error. Expected: specified "package": ' + debugConfiguration.package + " to exist.");
                return;
            }
            targetYaml = debugConfiguration.package;
        }
        else {
            vscode_1.window.showWarningMessage('Error. Neither "package" nor "robot" were specified in the launch.');
            return;
        }
        let interpreter = undefined;
        let interpreterResult = await (0, activities_1.resolveInterpreter)(targetYaml);
        if (!interpreterResult.success) {
            vscode_1.window.showWarningMessage("Error resolving interpreter info: " + interpreterResult.message);
            return;
        }
        interpreter = interpreterResult.result;
        if (!interpreter) {
            vscode_1.window.showWarningMessage("Unable to resolve interpreter for: " + targetYaml);
            return;
        }
        if (!interpreter.environ) {
            vscode_1.window.showErrorMessage("Unable to resolve interpreter environment based on: " + targetYaml);
            return;
        }
        let env = interpreter.environ;
        if (isActionPackageLaunch) {
            // Vault/work-items features not available in action server at this point.
        }
        else {
            // Resolve environment (updates the environment to add vault
            // environment variables as well as work-items environment variables).
            try {
                let newEnv = await vscode_1.commands.executeCommand(robocorpCommands_1.ROBOCORP_UPDATE_LAUNCH_ENV, {
                    "targetRobot": debugConfiguration.robot,
                    "env": env,
                });
                if (newEnv === "cancelled") {
                    channel_1.OUTPUT_CHANNEL.appendLine("Launch cancelled");
                    return;
                }
                else {
                    env = newEnv;
                }
            }
            catch (error) {
                // The command may not be available.
            }
        }
        // If vscode-python is installed, we need to disable the terminal activation as it
        // conflicts with the robot environment.
        if (roboConfig.getAutosetpythonextensiondisableactivateterminal()) {
            await (0, pythonExtIntegration_1.disablePythonTerminalActivateEnvironment)();
        }
        let actionResult;
        if (isActionPackageLaunch) {
            actionResult = await vscode_1.commands.executeCommand(robocorpCommands_1.ROBOCORP_COMPUTE_ROBOT_LAUNCH_FROM_ROBOCORP_CODE_LAUNCH, {
                "name": debugConfiguration.name,
                "request": debugConfiguration.request,
                "package": debugConfiguration.package,
                "actionName": debugConfiguration.actionName,
                "uri": debugConfiguration.uri,
                "jsonInput": debugConfiguration.jsonInput,
                "additionalPythonpathEntries": interpreter.additionalPythonpathEntries,
                "env": env,
                "pythonExe": interpreter.pythonExe,
                "noDebug": debugConfiguration.noDebug,
            });
        }
        else {
            actionResult = await vscode_1.commands.executeCommand(robocorpCommands_1.ROBOCORP_COMPUTE_ROBOT_LAUNCH_FROM_ROBOCORP_CODE_LAUNCH, {
                "name": debugConfiguration.name,
                "request": debugConfiguration.request,
                "robot": debugConfiguration.robot,
                "task": debugConfiguration.task,
                "additionalPythonpathEntries": interpreter.additionalPythonpathEntries,
                "env": env,
                "pythonExe": interpreter.pythonExe,
                "noDebug": debugConfiguration.noDebug,
            });
        }
        // In a custom run we get the input contents -- something as:
        // "type": "robocorp-code",
        // "name": "Robocorp Code: Launch task from current robot.yaml",
        // "request": "launch",
        // "robot": "c:/robot.yaml",
        // "task": "entrypoint",
        //
        // and convert it to the contents expected by robotframework-lsp:
        //
        // "type": "robotframework-lsp",
        // "name": "Robot: Current File",
        // "request": "launch",
        // "cwd": "${workspaceFolder}",
        // "target": "c:/task.robot",
        //
        // (making sure that we can actually do this and it's a robot launch for the task)
        let result = actionResult.result;
        const isPythonRun = result && result.type && result.type == "python";
        if (!isActionPackageLaunch && debugConfiguration.noDebug && (!actionResult.success || isPythonRun)) {
            // In no debug mode if it didn't work that's ok, we'll just go back to running
            // rcc directly (note that we try to go to the regular RF launch whenever
            // possible because we can edit the command line to be able to track the run with the
            // `Robot Output View` and put log messages in the `Console Output`).
            //
            // Also, in a Python run in noDebug mode we still run with RCC instead of falling
            // back to the run with the Python extension.
            let vaultInfoActionResult = await vscode_1.commands.executeCommand(robocorpCommands_1.ROBOCORP_GET_CONNECTED_VAULT_WORKSPACE_INTERNAL);
            if (vaultInfoActionResult?.success && vaultInfoActionResult.result) {
                debugConfiguration.workspaceId = vaultInfoActionResult.result.workspaceId;
            }
            // Not running with debug: just use rcc to launch.
            debugConfiguration.env = env;
            return debugConfiguration;
        }
        if (!actionResult.success) {
            vscode_1.window.showErrorMessage(actionResult.message);
            return;
        }
        if (isPythonRun) {
            let extension = vscode_1.extensions.getExtension("ms-python.python");
            if (extension) {
                if (!extension.isActive) {
                    // i.e.: Auto-activate python extension for the launch as the extension
                    // is only activated for debug on the resolution, whereas in this case
                    // the launch is already resolved.
                    await extension.activate();
                }
            }
        }
        // OUTPUT_CHANNEL.appendLine("Launching with: " + JSON.stringify(result));
        result["noDebug"] = debugConfiguration.noDebug;
        return result;
    }
}
exports.RobocorpCodeDebugConfigurationProvider = RobocorpCodeDebugConfigurationProvider;
function registerDebugger() {
    async function createDebugAdapterExecutable(config) {
        let env = config.env;
        if (!env) {
            env = {};
        }
        let robotHome = roboConfig.getHome();
        if (robotHome && robotHome.length > 0) {
            if (env) {
                env["ROBOCORP_HOME"] = robotHome;
            }
            else {
                env = { "ROBOCORP_HOME": robotHome };
            }
        }
        let targetMain = path.resolve(__dirname, "../../src/robocorp_code_debug_adapter/__main__.py");
        if (!fs.existsSync(targetMain)) {
            vscode_1.window.showWarningMessage("Error. Expected: " + targetMain + " to exist.");
            return;
        }
        if (!extension_1.globalCachedPythonInfo) {
            vscode_1.window.showWarningMessage("Error. Expected globalCachedPythonInfo to be set when launching debugger.");
            return;
        }
        const pythonExecutable = extension_1.globalCachedPythonInfo.pythonExe;
        if (!fs.existsSync(pythonExecutable)) {
            vscode_1.window.showWarningMessage("Error. Expected: " + pythonExecutable + " to exist.");
            return;
        }
        if (env) {
            return new vscode_1.DebugAdapterExecutable(pythonExecutable, ["-u", targetMain], { "env": env });
        }
        else {
            return new vscode_1.DebugAdapterExecutable(pythonExecutable, ["-u", targetMain]);
        }
    }
    vscode_1.debug.registerDebugAdapterDescriptorFactory("robocorp-code", {
        createDebugAdapterDescriptor: (session) => {
            const config = session.configuration;
            return createDebugAdapterExecutable(config);
        },
    });
    vscode_1.debug.registerDebugConfigurationProvider("robocorp-code", new RobocorpCodeDebugConfigurationProvider());
}
exports.registerDebugger = registerDebugger;
//# sourceMappingURL=debugger.js.map