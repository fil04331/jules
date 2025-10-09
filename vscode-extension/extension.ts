import * as vscode from 'vscode';

// Cette fonction est appelée lorsque votre extension est activée
export function activate(context: vscode.ExtensionContext) {

    console.log('Félicitations, votre extension "Jules" est maintenant active !');

    // La commande a été définie dans le fichier package.json
    // Elle est maintenant fournie avec une implémentation via registerCommand
    // L'ID de la commande doit correspondre au champ "command" dans package.json
    let disposable = vscode.commands.registerCommand('jules-vscode.start', () => {
        // Crée ou affiche une nouvelle webview
        JulesPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

// Cette fonction est appelée lorsque votre extension est désactivée
export function deactivate() {}

/**
 * Gère les panneaux webview de Jules
 */
class JulesPanel {
    public static currentPanel: JulesPanel | undefined;
    public static readonly viewType = 'jules';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Si nous avons déjà un panneau, montrez-le.
        if (JulesPanel.currentPanel) {
            JulesPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Sinon, créez un nouveau panneau.
        const panel = vscode.window.createWebviewPanel(
            JulesPanel.viewType,
            'Jules.google',
            column || vscode.ViewColumn.One,
            {
                // Activez javascript dans la webview
                enableScripts: true,
                // Et gardez le contenu du panneau même lorsqu'il n'est pas visible
                retainContextWhenHidden: true,
            }
        );

        JulesPanel.currentPanel = new JulesPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Définissez le contenu HTML du panneau
        this._panel.webview.html = this._getHtmlForWebview();

        // Écoutez la fermeture du panneau
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        JulesPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview() {
        // C'est ici que la magie opère.
        // Nous chargeons notre application Next.js (qui doit tourner sur localhost:3000)
        // dans un iframe qui remplit toute la webview.
        const julesAppUrl = 'http://localhost:3000';

        return `<!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Jules.google</title>
                <style>
                    html, body, iframe {
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        width: 100%;
                        border: none;
                        overflow: hidden;
                    }
                </style>
            </head>
            <body>
                <iframe src="${julesAppUrl}"></iframe>
            </body>
            </html>`;
    }
}
