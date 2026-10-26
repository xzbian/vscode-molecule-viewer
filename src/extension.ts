import * as vscode from "vscode";

type SupportedFormat = "xyz" | "extxyz" | "poscar" | "lammps";

function detectFormat(uri: vscode.Uri): SupportedFormat | undefined {
  const name = uri.path.split("/").pop() ?? "";
  const lower = name.toLowerCase();
  if (lower.endsWith(".extxyz")) {
    return "extxyz";
  }
  if (lower.endsWith(".xyz")) {
    return "xyz";
  }
  if (
    lower === "poscar" ||
    lower === "contcar" ||
    lower === "xdatcar" ||
    lower.endsWith(".vasp")
  ) {
    return "poscar";
  }
  if (lower.endsWith(".data") || lower.endsWith(".lmp")) {
    return "lammps";
  }
  return undefined;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const viewerJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "viewer.js"));
  const nglJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "node_modules", "ngl", "dist", "ngl.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; connect-src https: blob:;">
  <title>Structure Viewer</title>
  <style>
    html, body, #viewport {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #ffffff;
      color: #333;
      font-family: sans-serif;
    }
    #status {
      position: fixed;
      top: 8px;
      left: 8px;
      z-index: 10;
      background: rgba(0, 0, 0, 0.7);
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 12px;
      color: white;
    }
    #controls {
      position: fixed;
      bottom: 8px;
      left: 8px;
      z-index: 10;
      background: rgba(0, 0, 0, 0.8);
      padding: 8px;
      border-radius: 6px;
      font-size: 12px;
      display: none;
    }
    #controls input[type="range"] {
      width: 200px;
      margin: 0 8px;
    }
    #frameLabel {
      display: inline-block;
      min-width: 50px;
    }
    #mappingDialog {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
      min-width: 300px;
    }
    #mappingDialog h3 {
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 16px;
    }
    .mapping-row {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      gap: 10px;
    }
    .mapping-row label {
      min-width: 80px;
      font-weight: bold;
    }
    .mapping-row input {
      flex: 1;
      padding: 4px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    #mappingDialog button {
      margin-top: 15px;
      padding: 8px 16px;
      background: #007acc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    #mappingDialog button:hover {
      background: #005a9e;
    }
    #mappingOverlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999;
    }
  </style>
</head>
<body>
  <div id="status">Loading...</div>
  <div id="controls">
    <button id="playBtn">Play</button>
    <input type="range" id="frameSlider" min="0" max="0" value="0" />
    <span id="frameLabel">0/0</span>
  </div>
  <div id="mappingOverlay"></div>
  <div id="mappingDialog">
    <h3>Map Atom Types to Elements</h3>
    <div id="mappingInputs"></div>
    <button id="mappingSubmit">Load Structure</button>
  </div>
  <div id="viewport"></div>
  <script nonce="${nonce}" src="${nglJs}"></script>
  <script nonce="${nonce}" src="${viewerJs}"></script>
</body>
</html>`;
}

async function openViewer(
  context: vscode.ExtensionContext,
  uriArg?: vscode.Uri
): Promise<void> {
  let targetUri = uriArg;
  if (!targetUri && vscode.window.activeTextEditor?.document.uri.scheme === "file") {
    targetUri = vscode.window.activeTextEditor.document.uri;
  }

  if (!targetUri) {
    vscode.window.showErrorMessage("No file selected. Open a structure file and run the command again.");
    return;
  }

  const format = detectFormat(targetUri);
  if (!format) {
    vscode.window.showErrorMessage("Unsupported file. Use .xyz, .extxyz, POSCAR/CONTCAR/.vasp, .lmp, or .data.");
    return;
  }

  const fileBytes = await vscode.workspace.fs.readFile(targetUri);
  const text = new TextDecoder("utf-8").decode(fileBytes);



  const panel = vscode.window.createWebviewPanel(
    "structureViewer",
    `Structure Viewer: ${targetUri.path.split("/").pop() ?? "file"}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "media"),
        vscode.Uri.joinPath(context.extensionUri, "node_modules", "ngl")
      ]
    }
  );

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);
  panel.webview.postMessage({
    type: "loadStructure",
    format,
    text
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const openCommand = vscode.commands.registerCommand(
    "structureViewer.open",
    async (uri?: vscode.Uri) => {
      await openViewer(context, uri);
    }
  );

  context.subscriptions.push(openCommand);
}

export function deactivate(): void {}
