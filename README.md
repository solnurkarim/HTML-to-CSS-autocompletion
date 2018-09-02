# HTML to CSS selectors autocompletion VSCode extension

Provides autocompletion for classes and ids from `markup` documents to `stylesheets`.  
Default settings are set to `html` >> `css` flow. To change file types to get selectors from or to set file types to be provided with autocompletion use `HTML to CSS autocompletion` extension configuration from `command palette` or VSCode `user settings`.

![preview](assets/preview.gif)

## Extension features

- autocompletion of `classes` and `ids` to `stylesheet` documents
- configuration of `file types`, `files`, `folders` or `workspaces` to work with
- command palette configuration UI

## How to configure

- Enter `HTML to CSS autocompletion: Extension Configuration` from the command palette.
- `html-to-css-autocompletion` in VSCode user settings.

![preview](assets/preview-config.gif)

## Configuration options

- `html-to-css-autocompletion.autocompletionFilesScope`  
Defines scope for extension to work with. `Options`:   
`multi-root`: all selectors found within all root folders will be visible to defined stylesheets. This is default autocompletion provider's scope.  
`workspace`: all selectors found within particular workspace folder/project will be visible to stylesheets within that workspace folder.  
`linked files`: selectors will be provided only for linked stylesheets.   

- `html-to-css-autocompletion.getSelectorsFromFileTypes`  
Defines file types to be searched for classes and ids. Default: `html, php`  

- `html-to-css-autocompletion.provideSelectorsToFileTypes`  
Defines file types to be provided with autocompletion. Default: `css`  

- `html-to-css-autocompletion.folderNamesToBeIncluded`  
Defines only specific folder names to be searched. Default: `empty string`  

- `html-to-css-autocompletion.folderNamesToBeExcluded`  
Defines folder names to be excluded from being searched. Default: `node_modules`  

- `html-to-css-autocompletion.includePattern`  
Set custom glob pattern to get classes/ids from matched files. E.g.: `**/{folderName1,folderName2,...}/*.{fileType1,fileType2,...}`  

- `html-to-css-autocompletion.excludePattern`  
Set custom glob pattern to exclude search on pattern matches. E.g.: `**/{folderName1,folderName2,...}/**`

 


## Contribute
If you have any issues or would like to contribute to the development of this extension please drop by at [github](https://github.com/solnurkarim/HTML-to-CSS-autocompletion)/[github issues](https://github.com/solnurkarim/HTML-to-CSS-autocompletion/issues).
