const {
	workspace,
	window,
	languages,
	commands,
	Uri,
	MarkdownString,
	RelativePattern,
	CompletionItem,
	Position,
	Range,
	Hover
} = require('vscode');
const fs = require('fs');
const Path = require('path');

// get configuration settings from package.json on extension startup
let config = workspace.getConfiguration('html-to-css-autocompletion');

// VSCode extension API activate function
function activate(context) {
	// check if any workspaces/folders opened
	if (workspace.workspaceFolders.length !== 0) {
		getPathList();
		registerProviders();

		// register command palette configuration
		const configCommand = commands.registerCommand('htmlToCssConfig', async function() {
			// show configuration menu UI on command activation
			const configMenuInput = await window.showQuickPick(Object.keys(configInputMethods));

			// start handler for chosen setting
			if (configMenuInput) {
				configMenuInput === 'Restore configurations to default'
					? configInputMethods[configMenuInput]()
					: await configInputMethods[configMenuInput].set();
				if (configInput) {
					window.showInformationMessage('HTML to CSS autocompletion: Configuration changes are now active.');
					configInput = '';
				}
			}
		});

		// fire handler when extension configuration has been changed from command palette or user settings
		const configWatcher = workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('html-to-css-autocompletion')) {
				config = workspace.getConfiguration('html-to-css-autocompletion');
				if (!isActiveRestoreAllConfigs) {
					if (e.affectsConfiguration('html-to-css-autocompletion.autocompletionFilesScope'))
						providerScope = config.get('autocompletionFilesScope');
					if (e.affectsConfiguration('html-to-css-autocompletion.triggerCharacters')) registerProviders();
					// fetch files and selectors based on new config settings
					if (
						e.affectsConfiguration('html-to-css-autocompletion.getSelectorsFromFileTypes') ||
						e.affectsConfiguration('html-to-css-autocompletion.folderNamesToBeIncluded') ||
						e.affectsConfiguration('html-to-css-autocompletion.folderNamesToBeExcluded') ||
						e.affectsConfiguration('html-to-css-autocompletion.includePattern') ||
						e.affectsConfiguration('html-to-css-autocompletion.excludePattern')
					)
						getPathList();
				}
			}
		});

		// update 'files' object when workspace is added or removed
		const workspaceWatcher = workspace.onDidChangeWorkspaceFolders((e) => {
			if (e.added) {
				const newWorkspaceFolders = e.added;
				for (let index in newWorkspaceFolders) {
					const folder = newWorkspaceFolders[index];
					getPathList(folder.uri.fsPath);
				}
			}

			if (e.removed) {
				const removedWorkspaceFolders = e.removed;
				for (let index in removedWorkspaceFolders) {
					const folder = removedWorkspaceFolders[index];
					for (let obj in files) {
						if (files[obj].workspaceFolder === folder.uri.fsPath) {
							delete files[obj];
						}
					}
				}
			}
		});

		// will dispose watchers/listeners on extension deactivation or VScode exit
		context.subscriptions.push(configCommand);
		context.subscriptions.push(configWatcher);
		context.subscriptions.push(workspaceWatcher);
	}
}
exports.activate = activate;

let providerScope = config.get('autocompletionFilesScope');
let files = {};
let watchers = [];
let providers = [];
let isActiveRestoreAllConfigs = false;

// get all file paths if no workspace has been passed
function getPathList(workspaceFolder) {
	if (!workspaceFolder) files = {};

	// get from user settings which paths to include/exclude
	const includeFoldersConfig = config.get('folderNamesToBeIncluded');
	const excludeFoldersConfig = config.get('folderNamesToBeExcluded');
	const getFromFileTypesConfig = config.get('getSelectorsFromFileTypes');
	const includeConfig = config.get('includePattern');
	const excludeConfig = config.get('excludePattern');

	const fileTypesStr = getFromFileTypesConfig.reduce((str, fileType, ind) => {
		fileType = fileType.trim();
		return ind === getFromFileTypesConfig.length - 1 && getFromFileTypesConfig.length > 0
			? '{' + str + ',' + fileType + '}'
			: (str += ',' + fileType);
	});

	let includeStr;
	let include;
	if (workspaceFolder) {
		if (includeConfig) {
			include = new RelativePattern(workspaceFolder, includeConfig);
		} else if (includeFoldersConfig[0]) {
			includeStr = includeFoldersConfig.reduce((str, folder, ind) => {
				return ind === includeFoldersConfig.length - 1 && includeFoldersConfig.length > 0
					? '{' + str + ',' + folder + '}'
					: (str += ',' + folder);
			});
			include = new RelativePattern(workspaceFolder, `**/${includeStr}/*.${fileTypesStr}`);
		} else {
			include = new RelativePattern(workspaceFolder, `**/*.${fileTypesStr}`);
		}
	} else {
		if (includeConfig) {
			include = includeConfig;
		} else if (includeFoldersConfig[0]) {
			includeStr = includeFoldersConfig.reduce((str, folder, ind) => {
				return ind === includeFoldersConfig.length - 1 && includeFoldersConfig.length > 0
					? '{' + str + ',' + folder + '}'
					: (str += ',' + folder);
			});
			include = `**/${includeStr}/*.${fileTypesStr}`;
		} else {
			include = `**/*.${fileTypesStr}`;
		}
	}

	let excludeStr;
	let exclude;

	if (excludeConfig) {
		exclude = excludeConfig;
	} else {
		excludeStr = excludeFoldersConfig.reduce((str, folder, ind) => {
			return ind === excludeFoldersConfig.length - 1 && excludeFoldersConfig.length > 0
				? '{' + str + ',' + folder + '}'
				: (str += ',' + folder);
		});
		exclude = `**/${excludeStr}/**`;
	}

	// create file object for each resolved path
	workspace.findFiles(include, exclude, 100).then(
		(data) => {
			data.forEach((uri) => {
				createFileObject(uri);
			});
			getFiles();
		},
		(err) => console.log(new Error(err))
	);

	// set change/delete watcher for included files
	setFSWatcher(include);
}

// create object from the given path in 'files'
function createFileObject(uri) {
	const path = uri.fsPath;
	files[path] = {
		workspaceFolder: workspace.getWorkspaceFolder(uri).uri.fsPath,
		path: path,
		isProcessing: false,
		data: null,
		selectors: {},
		stylesheets: []
	};
}

// get data from paths
function getFiles(fileChange) {
	// get data from all paths in 'files' if no particular path has been received
	if (fileChange) {
		readFile(fileChange);
	} else {
		for (let obj in files) {
			//skip if path has already been read
			if (files[obj].data) continue;
			const path = files[obj].path;
			readFile(path);
		}
	}
}

// get data from path then send it to parser
function readFile(path) {
	fs.readFile(path, 'utf8', (err, file) => {
		if (err) {
			console.log(err);
		}
		files[path].data = file;
		parseData(files[path]);
	});
	files[path].isProcessing = true;
}

// get classes/ids and stylesheet paths from given file object
function parseData(fileObj) {
	fileObj.selectors = {};
	fileObj.stylesheets = [];
	const file = fileObj.data;
	let regex = /(class|id|rel=["'].*(stylesheet).*["'].+href)=["']([^"']+)["']/gi;
	let match;
	let selector;

	while ((match = regex.exec(file))) {
		if (match[1] === 'class') {
			let matchArr = match[3].split(' ');
			for (let index in matchArr) {
				selector = '.' + matchArr[index];
				setFileObjectSelectors(fileObj, selector);
			}
		} else if (match[1] === 'id') {
			selector = '#' + match[3];
			setFileObjectSelectors(fileObj, selector);
		} else if (match[2] === 'stylesheet') {
			const stylesheet = Path.resolve(Path.dirname(fileObj.path), match[3]);
			fileObj.stylesheets.push(stylesheet);
		}
		// else console.log(new Error('Unexpected pattern match: ' + match[0]));
	}

	fileObj.isProcessing = false;
}

// set selectors within each file/path object
function setFileObjectSelectors(fileObject, selector) {
	fileObject.selectors.hasOwnProperty(selector)
		? fileObject.selectors[selector]++
		: (fileObject.selectors[selector] = 1);
}

// get each selector and some data about it from file/path object and store it in received object reference
function getFileObjectSelectors(fileObj, selectorsObj) {
	for (let selector in fileObj.selectors) {
		if (selectorsObj.hasOwnProperty(selector)) {
			selectorsObj[selector].count += fileObj.selectors[selector];
			selectorsObj[selector].files.push({
				uri: Uri.file(fileObj.path),
				relativePath: workspace.asRelativePath(fileObj.path, true)
			});
		} else {
			selectorsObj[selector] = {
				selector: selector,
				count: fileObj.selectors[selector],
				files: [
					{
						uri: Uri.file(fileObj.path),
						relativePath: workspace.asRelativePath(fileObj.path, true)
					}
				]
			};
		}
	}
}

function registerItemProvider(languageFilter) {
	const triggerCharsBool = config.get('triggerCharacters');

	const providerFunction = {
		provideCompletionItems: (document, position, token, context) => {
			// check if provider was invoked by trigger character || document is minified
			if ((triggerCharsBool && context.triggerKind != 1) || position.character > 100) return;

			// check if cursor position is not within property line
			const start = new Position(position.line, 0);
			const range = new Range(start, position);
			const lineText = document.getText(range);

			for (let i = lineText.length - 1; i > 0; i--) {
				if (lineText[i] === ':' && lineText[i + 1] === ' ') return;
			}

			const items = [];
			// get selectors within defined extension scope
			const scopedSelectors = getScopedSelectors(document);

			// create completion items
			for (let selector in scopedSelectors) {
				const selectorObj = scopedSelectors[selector];
				const item = new CompletionItem(selector);
				// set count and source data for given selector
				item.documentation = getSelectorData(selectorObj);
				// set icon
				item.kind = 13;
				items.push(item);
			}

			return items;
		}
	};

	// register provider with or without trigger characters
	let completionProvider;
	if (triggerCharsBool) {
		completionProvider = languages.registerCompletionItemProvider(
			languageFilter,
			providerFunction,
			...[ '#', '.' ]
		);
	} else {
		completionProvider = languages.registerCompletionItemProvider(languageFilter, providerFunction);
	}

	providers.push(completionProvider);
}

function registerHoverProvider(languageFilter) {
	const hoverProvider = languages.registerHoverProvider(languageFilter, {
		provideHover: (document, position, token) => {
			// get word at mouse pointer and return information about it if it's a class or id
			const start = new Position(position.line, 0);
			const end = new Position(position.line + 1, 0);
			const range = new Range(start, end);
			const line = document.getText(range);
			const selectorLeft = line.slice(null, position.character).match(/[\#\.][\w_-]*$/);
			const selectorRight = line.slice(position.character).match(/^[\w_-]*/);
			const selector = selectorLeft[0] + selectorRight[0];

			// get selectors within defined extension scope
			const scopedSelectors = getScopedSelectors(document);

			if (scopedSelectors.hasOwnProperty(selector)) {
				const content = getSelectorData(scopedSelectors[selector]);
				const hover = new Hover(content);
				return hover;
			} else return null;
		}
	});
	providers.push(hoverProvider);
}

// register autocompletion and mouse hover providers
function registerProviders() {
	// dispose of already registered providers
	if (providers.length > 0) removeDisposables(providers);
	// set file types to provide completions to
	const languageFilter = {
		scheme: 'file',
		pattern: '**/*.{css,scss,less,sass,styl}'
	};
	registerItemProvider(languageFilter);
	registerHoverProvider(languageFilter);
}

// check which extension scope is defined and return selectors from files within that scope
function getScopedSelectors(document) {
	const workspaceFolder = workspace.getWorkspaceFolder(document.uri).uri.fsPath;
	let scopedSelectors = {};

	// get selectors within particular workspace folder
	if (providerScope === 'workspace') {
		for (let obj in files) {
			const file = files[obj];
			if (file.workspaceFolder === workspaceFolder) {
				getFileObjectSelectors(file, scopedSelectors);
			}
		}
	} else if (providerScope === 'linked-files') {
		// get selectors from files where active stylesheet has been defined within <link/> tag
		for (let obj in files) {
			const file = files[obj];
			for (let index in file.stylesheets) {
				if (file.stylesheets[index] === document.uri.fsPath) {
					getFileObjectSelectors(file, scopedSelectors);
					break;
				}
			}
		}
	} else {
		// get all project selectors
		for (let obj in files) {
			const file = files[obj];
			getFileObjectSelectors(file, scopedSelectors);
		}
	}

	return scopedSelectors;
}

// set count and source data for completion/hover item
function getSelectorData(selectorObj) {
	let itemDoc = new MarkdownString(
		'`' + selectorObj.selector + '`\r\n\r\n' + selectorObj.count + ' occurences in files:\r\n\r\n'
	);
	for (let index in selectorObj.files) {
		const pathObj = selectorObj.files[index];
		itemDoc.appendMarkdown('\r\n\r\n[' + pathObj.relativePath + '](' + pathObj.uri + ')');
	}

	return itemDoc;
}

// update file object data on file change/create/delete
function setFSWatcher(includePattern) {
	// dispose of already registered watchers
	if (watchers.length > 0) removeDisposables(watchers);
	const globWatcher = workspace.createFileSystemWatcher(includePattern);
	watchers.push(globWatcher);

	globWatcher.onDidChange((uri) => {
		if (files.hasOwnProperty(uri.fsPath) && files[uri.fsPath].isProcessing) return;
		getFiles(uri.fsPath);
	});

	globWatcher.onDidDelete((uri) => {
		delete files[uri.fsPath];
	});

	globWatcher.onDidCreate((uri) => {
		createFileObject(uri);
		getFiles(uri.fsPath);
	});
}

/**
 * config section
 */

let configInput;

// show specified configuration input UI and update config or ask to restore config if no data provided
const configInputMethods = {
	'Toggle trigger keys': {
		configName: 'triggerCharacters',
		defaultVal: false,
		set: async function() {
			configInput = await window.showQuickPick([ 'Enable', 'Disable' ], {
				placeHolder: "Shows completion list only on '#'/'.' character entries."
			});
			if (configInput === 'Enable') config.update(this.configName, true);
			else config.update(this.configName, false);
		},
		toDefault: function() {
			config.update(this.configName, this.defaultVal);
		}
	},
	'Set autocompletion workspace scope': {
		configName: 'autocompletionFilesScope',
		defaultVal: 'multi-root',
		set: async function() {
			configInput = await window.showQuickPick([ 'multi-root', 'workspace', 'linked-files' ]);
			if (configInput) updateConfig(this.configName, configInput);
		},
		toDefault: function() {
			updateConfig(this.configName, this.defaultVal);
		}
	},
	'Set file types to be searched for classes/ids': {
		configName: 'getSelectorsFromFileTypes',
		defaultVal: 'html,php',
		set: async function() {
			configInput = await window.showInputBox({
				prompt: 'Set file types to be searched for classes/ids. E.g.: html, php',
				placeHolder: 'html'
			});

			if (configInput) updateConfig(this.configName, configInput);
			else if (configInput === '') askToDefault(this);
		},
		toDefault: function() {
			updateConfig(this.configName, this.defaultVal);
		}
	},
	'Set list of include folders': {
		configName: 'folderNamesToBeIncluded',
		defaultVal: '',
		set: async function() {
			configInput = await window.showInputBox({
				prompt: 'Sets folders to be searched for file types. E.g.: app, folderName, folderName2'
			});

			if (configInput) updateConfig(this.configName, configInput);
			else if (configInput === '') askToDefault(this);
		},
		toDefault: function() {
			updateConfig(this.configName, this.defaultVal);
		}
	},
	'Set list of exclude folders': {
		configName: 'folderNamesToBeExcluded',
		defaultVal: 'node_modules',
		set: async function() {
			configInput = await window.showInputBox({
				prompt: 'Sets folders to be excluded from searching. E.g.: app, folderName, folderName2'
			});

			if (configInput) updateConfig(this.configName, configInput);
			else if (configInput === '') askToDefault(this);
		},
		toDefault: function() {
			updateConfig(this.configName, this.defaultVal);
		}
	},
	'Set include glob pattern': {
		configName: 'includePattern',
		defaultVal: '',
		set: async function() {
			configInput = await window.showInputBox({
				prompt: 'Set include glob pattern. E.g.: **/{folderName1,folderName2,...}/*.{fileType1,fileType2,...}'
			});

			if (configInput) updateConfig(this.configName, configInput);
			else if (configInput === '') askToDefault(this);
		},
		toDefault: function() {
			updateConfig(this.configName, this.defaultVal);
		}
	},
	'Set exclude glob pattern': {
		configName: 'excludePattern',
		defaultVal: '',
		set: async function() {
			configInput = await window.showInputBox({
				prompt: 'Set exclude glob pattern. E.g.: **/{folderName1,folderName2,...}/**'
			});

			if (configInput) updateConfig(this.configName, configInput);
			else if (configInput === '') askToDefault(this);
		},
		toDefault: function() {
			updateConfig(this.configName, this.defaultVal);
		}
	},
	// restore all extension configurations to default, renew files data and re-register providers
	'Restore configurations to default': function() {
		isActiveRestoreAllConfigs = true;
		const configOptions = Object.keys(this);
		for (let i = 0; i < configOptions.length - 1; i++) {
			this[configOptions[i]].toDefault();
		}
		providerScope = config.get('autocompletionFilesScope');
		getPathList();
		registerProviders();
		window.showInformationMessage('HTML to CSS autocompletion: All files have been parsed.');
		isActiveRestoreAllConfigs = false;
	}
};

// show restore to default confirmation UI
async function askToDefault(configObj) {
	const checkInput = await window.showQuickPick([ 'Restore to default', 'Cancel' ]);
	if (checkInput === 'Restore to default') configObj.toDefault();
}

// update extension configuration within user settings
async function updateConfig(configName, userInput) {
	let input;
	if (
		configName === 'getSelectorsFromFileTypes' ||
		configName === 'folderNamesToBeIncluded' ||
		configName === 'folderNamesToBeExcluded'
	)
		input = userInput.split(',').map((elem) => elem.trim());
	else input = userInput.trim();
	await config.update(configName, input);
}

function removeDisposables(disposables) {
	if (disposables) {
		disposables.forEach((disposable) => disposable.dispose());
	} else {
		watchers.forEach((disposable) => disposable.dispose());
		providers.forEach((disposable) => disposable.dispose());
	}
}

// will dispose watchers/providers on extension deactivation or VScode exit
function deactivate() {
	removeDisposables();
}
exports.deactivate = deactivate;
