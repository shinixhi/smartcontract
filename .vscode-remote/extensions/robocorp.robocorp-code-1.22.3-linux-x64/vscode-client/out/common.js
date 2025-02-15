"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareVersions = exports.verifyIfPathOkToCreatePackage = exports.isDirectoryAPackageDirectory = exports.areThereRobotsInWorkspace = exports.isActionPackage = exports.debounce = void 0;
const roboCommands = require("./robocorpCommands");
const vscode = require("vscode");
const vscode_1 = require("vscode");
const channel_1 = require("./channel");
const rcc_1 = require("./rcc");
const debounce = (func, wait) => {
    let timeout;
    return function wrapper(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};
exports.debounce = debounce;
const isActionPackage = (entry) => {
    return entry.filePath.endsWith("package.yaml");
};
exports.isActionPackage = isActionPackage;
async function areThereRobotsInWorkspace() {
    let asyncListLocalRobots = vscode.commands.executeCommand(roboCommands.ROBOCORP_LOCAL_LIST_ROBOTS_INTERNAL);
    let actionResultListLocalRobots = await asyncListLocalRobots;
    let robotsInWorkspace = false;
    if (!actionResultListLocalRobots.success) {
        (0, rcc_1.feedbackRobocorpCodeError)("ACT_LIST_ROBOT");
        vscode_1.window.showErrorMessage("Error listing robots: " + actionResultListLocalRobots.message + " (Robot creation will proceed).");
        // This shouldn't happen, but let's proceed as if there were no Robots in the workspace.
    }
    else {
        let robotsInfo = actionResultListLocalRobots.result;
        robotsInWorkspace = robotsInfo && robotsInfo.length > 0;
    }
    return robotsInWorkspace;
}
exports.areThereRobotsInWorkspace = areThereRobotsInWorkspace;
async function isDirectoryAPackageDirectory(wsUri) {
    // Check if we still don't have a Robot in this folder (i.e.: if we have a Robot in the workspace
    // root already, we shouldn't create another Robot inside it).
    try {
        let dirContents = await vscode.workspace.fs.readDirectory(wsUri);
        for (const element of dirContents) {
            if (element[0] === "robot.yaml" || element[0] === "conda.yaml" || element[0] === "package.yaml") {
                vscode_1.window.showErrorMessage("It's not possible to create a Package in: " +
                    wsUri.fsPath +
                    " because this workspace folder is already a Task or Action Package (nested Packages are not allowed).");
                return true;
            }
        }
    }
    catch (error) {
        (0, channel_1.logError)("Error reading contents of: " + wsUri.fsPath, error, "ACT_CREATE_ROBOT");
    }
    return false;
}
exports.isDirectoryAPackageDirectory = isDirectoryAPackageDirectory;
async function verifyIfPathOkToCreatePackage(targetDir) {
    let dirUri = vscode.Uri.file(targetDir);
    let directoryExists = true;
    try {
        let stat = await vscode.workspace.fs.stat(dirUri); // this will raise if the directory doesn't exist.
        if (stat.type == vscode_1.FileType.File) {
            vscode_1.window.showErrorMessage("It's not possible to create a Package in: " +
                targetDir +
                " because this points to a file which already exists (please erase this file and retry).");
            return "cancel";
        }
    }
    catch (err) {
        // ok, directory does not exist
        directoryExists = false;
    }
    let force = false;
    if (directoryExists) {
        let isEmpty = true;
        try {
            // The directory already exists, let's see if it's empty (if it's not we need to check
            // whether to force the creation of the Robot).
            let dirContents = await vscode.workspace.fs.readDirectory(dirUri);
            for (const element of dirContents) {
                if (element[0] != ".vscode") {
                    // If there's just a '.vscode', proceed, otherwise,
                    // we need to ask the user about overwriting it.
                    isEmpty = false;
                    break;
                }
                else {
                    force = true;
                }
            }
        }
        catch (error) {
            (0, channel_1.logError)("Error reading contents of directory: " + dirUri, error, "ACT_CREATE_ROBOT_LIST_TARGET");
        }
        if (!isEmpty) {
            const CANCEL = "Cancel Package Creation";
            // Check if the user wants to override the contents.
            let target = await vscode_1.window.showQuickPick([
                {
                    "label": "Create Package anyways",
                    "detail": "The Package will be created and conflicting files will be overwritten.",
                },
                {
                    "label": CANCEL,
                    "detail": "No changes will be done.",
                },
            ], {
                "placeHolder": "The directory is not empty. How do you want to proceed?",
                "ignoreFocusOut": true,
            });
            if (!target || target["label"] == CANCEL) {
                // Operation cancelled.
                return "cancel";
            }
            force = true;
        }
    }
    if (force) {
        return "force";
    }
    return "empty";
}
exports.verifyIfPathOkToCreatePackage = verifyIfPathOkToCreatePackage;
function compareVersions(version1, version2) {
    // Example usage:
    // console.log(compareVersions("0.0.3", "4.3.1")); // Output: -1 (0.0.3 < 4.3.1)
    // console.log(compareVersions("4.3.1", "4.4a1")); // Output: -1 (4.3.1 < 4.4a1)
    // console.log(compareVersions("4.5.1", "4.2")); // Output: 1 (4.5.1 > 4.2)
    // console.log(compareVersions("1.0.0", "1.0.0")); // Output: 0 (1.0.0 == 1.0.0)
    // console.log(compareVersions("2.0", "2.0.0")); // Output: 0 (2.0 == 2.0.0)
    const v1Components = version1
        .split(".")
        .map((component) => (isNaN(parseInt(component)) ? component : parseInt(component)));
    const v2Components = version2
        .split(".")
        .map((component) => (isNaN(parseInt(component)) ? component : parseInt(component)));
    const maxLength = Math.max(v1Components.length, v2Components.length);
    for (let i = 0; i < maxLength; i++) {
        const v1Value = v1Components[i] || 0;
        const v2Value = v2Components[i] || 0;
        if (v1Value < v2Value) {
            return -1;
        }
        else if (v1Value > v2Value) {
            return 1;
        }
    }
    return 0;
}
exports.compareVersions = compareVersions;
//# sourceMappingURL=common.js.map