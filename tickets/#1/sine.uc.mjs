// ==UserScript==
// @include   main
// @include   about:preferences*
// @include   about:settings*
// @ignorecache
// ==/UserScript==

import * as UC_API from "chrome://userchromejs/content/uc_api.sys.mjs";
// Allow writing outside of the resources folder.
UC_API.Prefs.set("userChromeJS.allowUnsafeWrites", true);
// Allow script to run on about:preferences/settings page.
UC_API.Prefs.set("userChromeJS.persistent_domcontent_callback", true);
// If auto-updating not set, set to true.
if (!UC_API.Prefs.get("sine.auto-updates").exists()) UC_API.Prefs.set("sine.auto-updates", true);
if (!UC_API.Prefs.get("sine.script.auto-update").exists()) UC_API.Prefs.set("sine.script.auto-update", true);

console.log("Sine is active!");

const Sine = {
    XUL: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    storeURL: "https://cosmocreeper.github.io/Sine/latest.json",
    scriptURL: "https://cosmocreeper.github.io/Sine/sine.uc.mjs",
    updatedAt: "2025-05-20 23:00",
    version: "1.1.5",

    async fetch(url, forceText=false) {
        await UC_API.Prefs.set("sine.fetch-url", url);
        return new Promise((resolve) => {
            const listener = UC_API.Prefs.addListener("sine.fetch-url", async () => {
                UC_API.Prefs.removeListener(listener);
                let response = await UC_API.SharedStorage.widgetCallbacks.get("fetch-results");
                try {
                    if (!forceText) response = JSON.parse(response);
                } catch {}
                resolve(response);
            });
        });
    },

    async process(action) {
        UC_API.Prefs.set("sine.process", action);
        return new Promise((resolve) => {
            const listener = UC_API.Prefs.addListener("sine.process", () => {
                UC_API.Prefs.removeListener(listener);
                resolve("complete");
            });
        });
    },

    get utils() {
        return ZenThemesCommon;
    },

    get manager() {
        return gZenMarketplaceManager;
    },

    get os() {
        return gZenOperatingSystemCommonUtils.currentOperatingSystem;
    },

    get chromeDir() {
        const chromeDir = UC_API.FileSystem.chromeDir().fileURI.replace("file:///", "").replace(/%20/g, " ");
        return this.os === "windows" ? chromeDir.replace(/\//g, "\\") : chromeDir;
    },

    get autoUpdates() {
        return UC_API.Prefs.get("sine.auto-updates")["value"];
    },

    set autoUpdates(newValue) {
        UC_API.Prefs.set("sine.auto-updates", newValue);
    },

    async updateScript(mainProcess=true) {
        const data = mainProcess ? await fetch(this.scriptURL).then(res => res.text()) : await this.fetch(this.scriptURL);
        const latestScript = data.catch(err => console.warn(err));
        await UC_API.FileSystem.writeFile("../JS/sine.uc.mjs", latestScript);
    },

    async initWindow() {
        const latest = await fetch(this.storeURL).then(res => res.json()).catch(err => console.warn(err));
        if (latest) {
            this.modGitHubs = latest.marketplace;
            if (UC_API.Prefs.get("sine.script.auto-update")["value"] && new Date(latest.updatedAt) > new Date(this.updatedAt)) {
                await this.updateScript();
                if (UC_API.Prefs.get("sine.script.auto-restart")["value"])
                    Services.startup.quit(Services.startup.eAttemptQuit | Services.startup.eRestart);
                else
                    alert(`Sine has been updated to version ${latest.version}. Please restart your browser for these changes to take effect.`);
            }
        }
    },

    rawURL(repo) {
        if (repo.startsWith("https://github.com/"))
            repo = repo.replace("https://github.com/", "");
        let repoName;
        let branch;
        let folder = false;
        if (repo.includes("/tree/")) {
            repoName = repo.split("/tree/")[0];
            const parts = repo.split("/tree/");
            const branchParts = parts[1].split("/");
            branch = branchParts[0];
            if (branchParts[1].endsWith("/")) branchParts[1].substring(0, branchParts[1].length - 1);
            else folder = branchParts[1];
        } else {
            branch = "main"; // Default branch if not specified
            // If there is no folder, use the whole repo name
            if (repo.endsWith("/")) repoName = repo.substring(0, repo.length - 1);
            else repoName = repo;
        }
        return `https://raw.githubusercontent.com/${repoName}/${branch}${folder ? "/" + folder : ""}/`;
    },

    async toggleTheme(themeData, remove) {
        if (remove) await this.manager.disableTheme(themeData["id"]);
        else await this.manager.enableTheme(themeData["id"]);
        this.manager._doNotRebuildThemesList = true;
    },

    formatMD(label) {
        // Sanitize input to prevent XSS.
        let formatted = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        formatted = formatted
            .replace(/\\(\*\*)/g, "\x01") // Replace \** with a placeholder
            .replace(/\\(\*)/g, "\x02")   // Replace \* with a placeholder
            .replace(/\\(~)/g, "\x05");   // Replace \~ with a placeholder
        
        const formatRules = [
            { pattern: /\*\*([^\*]+)\*\*/g, replacement: "<b>$1</b>" }, // Bold with **
            { pattern: /\*([^\*]+)\*/g, replacement: "<i>$1</i>" },     // Italic with *
            { pattern: /~([^~]+)~/g, replacement: "<u>$1</u>" }         // Underline with ~
        ];
      
        formatRules.forEach(rule => {
            formatted = formatted.replace(rule.pattern, rule.replacement);
        });
      
        formatted = formatted
            .replace(/\x01/g, "**")  // Restore **
            .replace(/\x02/g, "*")   // Restore *
            .replace(/\x05/g, "~")  // Restore ~
            .replace(/&\s/g, "&amp;")  // Replace ampersand with HTML entity for support.
            .replace(/\n/g, "<br></br>"); // Replace <br> with break.
      
        return formatted;
    },

    parsePrefs(pref) {
        if (pref.hasOwnProperty("disabledOn") && pref["disabledOn"].includes(this.os)) return;

        const docName = {
            "separator": "div",
            "checkbox": "checkbox",
            "dropdown": "hbox",
            "text": "p",
            "string": "hbox"
        }

        let prefEl;
        if (docName.hasOwnProperty(pref["type"])) prefEl = document.createElement(docName[pref["type"]]);
        else prefEl = pref["type"];
        if (pref.hasOwnProperty("property")) prefEl.id = pref["property"].replace(/\./g, "-");

        if (pref.hasOwnProperty("label")) {
            pref["label"] = this.formatMD(pref["label"]);
        } if (pref.hasOwnProperty("property") && pref["type"] !== "separator") {
            prefEl.title = pref["property"];
        } if (pref.hasOwnProperty("margin")) {
            prefEl.style.margin = pref["margin"];
        } if (pref.hasOwnProperty("size")) {
            prefEl.style.fontSize = pref["size"];
        }

        if ((pref["type"] === "string" || pref["type"] === "dropdown") && pref.hasOwnProperty("label")) {
            const hboxLabel = document.createElement("label");
            hboxLabel.className = "zenThemeMarketplaceItemPreferenceLabel";
            hboxLabel.innerHTML = pref["label"];
            prefEl.appendChild(hboxLabel);
        }

        if (pref["type"] === "separator") {
            prefEl.innerHTML += `<hr style="${pref.hasOwnProperty("height") ? `border-width: ${pref["height"]};` : ""}"></hr>`;
            if (pref.hasOwnProperty("label")) {
                prefEl.innerHTML += 
                    `<label class="separator-label" 
                        ${pref.hasOwnProperty("property") ? `title="${pref["property"]}"`: ""}>
                            ${pref["label"]}
                     </label>`;
            }
        } else if (pref["type"] === "checkbox") {
            prefEl.className = "zenThemeMarketplaceItemPreferenceCheckbox";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            prefEl.appendChild(checkbox);
            if (pref.hasOwnProperty("label")) {
                const checkLabel = document.createElement("label");
                checkLabel.className = "checkbox-label";
                checkLabel.innerHTML = pref["label"];
                prefEl.appendChild(checkLabel);
            }
        } else if (pref["type"] === "dropdown") {
            const menulist = document.createElementNS(this.XUL, "menulist");
            const menupopup = document.createElementNS(this.XUL, "menupopup");
            menupopup.className = "in-menulist";
            if (pref["placeholder"] !== false) {
                menulist.setAttribute("label", pref["placeholder"] || "None");
                menulist.setAttribute("value", "none");
                const menuitem = document.createElementNS(this.XUL, "menuitem");
                menuitem.setAttribute("value", "none");
                menuitem.setAttribute("label", pref["placeholder"] || "None");
                menuitem.textContent = pref["placeholder"] || "None";
                menupopup.appendChild(menuitem);
            }
            const placeholderSelected = UC_API.Prefs.get(pref["property"])["value"] === "" || UC_API.Prefs.get(pref["property"])["value"] === "none";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (UC_API.Prefs.get(pref["property"]).exists() && (!hasDefaultValue || UC_API.Prefs.get(pref["property"]).hasUserValue()) && !placeholderSelected) {
                const value = UC_API.Prefs.get(pref["property"])["value"];
                menulist.setAttribute("label", pref["options"].find(item => item["value"] === value)["label"]);
                menulist.setAttribute("value", value);
            } else if (hasDefaultValue && !placeholderSelected) {
                menulist.setAttribute("label", pref["options"].find(item => item["value"] === pref["defaultValue"] || item["value"] === pref["default"])["label"]);
                menulist.setAttribute("value", pref["defaultValue"] || pref["default"]);
                UC_API.Prefs.set(pref["property"], pref["defaultValue"] || pref["default"]);
            } else if (pref["options"].length >= 1 && !placeholderSelected) {
                menulist.setAttribute("label", pref["options"][0]["label"]);
                menulist.setAttribute("value", pref["options"][0]["value"]);
                UC_API.Prefs.set(pref["property"], pref["options"][0]["value"]);
            }
            
            pref["options"].forEach((option) => {
                const menuitem = document.createElementNS(this.XUL, "menuitem");
                menuitem.setAttribute("label", option["label"]);
                menuitem.setAttribute("value", option["value"]);
                menuitem.textContent = option["label"];
                menupopup.appendChild(menuitem);
            });
            menulist.addEventListener("command", () => {
                const value = menulist.getAttribute("value");
                UC_API.Prefs.set(pref["property"], pref["value"] === "number" ? Number(value) : value);
                this.manager._triggerBuildUpdateWithoutRebuild();
            });
            menulist.appendChild(menupopup);
            prefEl.appendChild(menulist);
        } else if (pref["type"] === "text" && pref.hasOwnProperty("label")) {
            prefEl.innerHTML = pref["label"];
        } else if (pref["type"] === "string") {
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = pref["placeholder"] || "Type something...";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (UC_API.Prefs.get(pref["property"]).exists() && (!hasDefaultValue || UC_API.Prefs.get(pref["property"]).hasUserValue()))
                input.value = UC_API.Prefs.get(pref["property"])["value"];
            else {
                UC_API.Prefs.set(pref["property"], pref["defaultValue"] || pref["default"] || "");
                input.value = pref["defaultValue"] || pref["default"];
            }
            if (pref.hasOwnProperty("border") && pref["border"] === "value") input.style.borderColor = input.value;
            else if (pref.hasOwnProperty("border")) input.style.borderColor = pref["border"];
            input.addEventListener("change", () => {
                UC_API.Prefs.set(pref["property"], pref["value"] === "number" ? Number(input.value) : input.value);
                this.manager._triggerBuildUpdateWithoutRebuild();
                if (pref.hasOwnProperty("border") && pref["border"] === "value") input.style.borderColor = input.value;
            });
            prefEl.appendChild(input);
        }

        if (((pref["type"] === "separator" && pref.hasOwnProperty("label")) || pref["type"] === "checkbox") && pref.hasOwnProperty("property")) {
            const clickable = pref["type"] === "checkbox" ? prefEl : prefEl.children[1];
            if ((pref["defaultValue"] || pref["default"]) && !UC_API.Prefs.get(pref["property"]).exists()) UC_API.Prefs.set(pref["property"], true);
            if (UC_API.Prefs.get(pref["property"])["value"]) clickable.setAttribute("checked", true);
            if (pref["type"] === "checkbox" && clickable.getAttribute("checked")) clickable.children[0].checked = true;
            clickable.addEventListener("click", (e) => {
                UC_API.Prefs.set(pref["property"], e.currentTarget.getAttribute("checked") ? false : true);
                if (pref["type"] === "checkbox" && e.target.type !== "checkbox") clickable.children[0].checked = e.currentTarget.getAttribute("checked") ? false : true;
                e.currentTarget.getAttribute("checked") ? e.currentTarget.removeAttribute("checked") : e.currentTarget.setAttribute("checked", true);
            });
        }

        return prefEl;
    },

    waitForElm(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
    
            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    },

    generateSingleSelector(cond, isNot) {
        const propertySelector = cond.property.replace(/\./g, "-");
        const isBoolean = typeof cond.value === "boolean";
        if (isBoolean) return isNot ? `:has(#${propertySelector}:not([checked])` : `:has(#${propertySelector}[checked])`;
        else return isNot ? `:not(:has(#${propertySelector} > *[value="${cond.value}"]))` : `:has(#${propertySelector} > *[value="${cond.value}"])`;
    },

    generateSelector(conditions, operator, id) {
        const condArray = Array.isArray(conditions) ? conditions : [conditions];
        if (condArray.length === 0) return "";
        const selectors = condArray.map(cond => {
            if (cond.if) return this.generateSingleSelector(cond.if, false);
            else if (cond.not) return this.generateSingleSelector(cond.not, true);
            else if (cond.conditions) return this.generateSelector(cond.conditions, cond.operator || "AND");
            else throw new Error("Invalid condition");
        }).filter(s => s);
        if (selectors.length === 0) return "";
        if (operator === "OR") return selectors.map(s => `dialog[open] .zenThemeMarketplaceItemPreferenceDialogContent${s} #${id}`).join(", ");
        else return `dialog[open] .zenThemeMarketplaceItemPreferenceDialogContent${selectors.join("")} #${id}`;
    },

    injectDynamicCSS(pref) {
        const styleEl = document.createElement("style");
        const targetId = pref.property.replace(/\./g, "-");
        const selector = this.generateSelector(pref.conditions, pref.operator || "OR", pref.property.replace(/\./g, "-"));
        styleEl.textContent = `
            #${targetId} {
                display: none;
            }
            ${selector} {
                display: flex;
            }
        `;
        document.head.appendChild(styleEl);
    },

    async loadMods() {
        await this.waitForElm(".zenThemeMarketplaceItem");
        document.querySelectorAll(".zenThemeMarketplaceItem").forEach((el) => el.remove());
        const installedMods = await this.utils.getThemes();
        const sortedArr = Object.values(installedMods).sort((a, b) => a["name"].localeCompare(b["name"]));
        const ids = sortedArr.map(obj => obj["id"]);
        for (const key of ids) {
            const modData = installedMods[key];
            // Create new item.
            const item = document.createElement("vbox");
            item.className = "zenThemeMarketplaceItem";

            // Create new content.
            const content = document.createElement("vbox");
            content.className = "zenThemeMarketplaceItemContent";
            // Create new header
            const header = document.createElement("hbox");
            header.id = "zenThemeMarketplaceItemContentHeader";
            header.innerHTML = `
                <label>
                    <h3 class="zenThemeMarketplaceItemTitle">${modData["name"]} (v${modData["version"]})</h3>
                </label>
            `;
            // Create new toggle button.
            const toggle = document.createElement("moz-toggle");
            toggle.className = "zenThemeMarketplaceItemPreferenceToggle";
            toggle.title = `${modData["enabled"] ? "Disable" : "Enable"} mod`;
            if (modData["enabled"])
                toggle.setAttribute("pressed", "true");
            // Logic to disable mod.
            toggle.addEventListener("click", async () => {
                const themes = await this.utils.getThemes()
                const theme = themes[modData["id"]];
                await this.toggleTheme(theme, theme["enabled"]);
                toggle.title = `${theme["enabled"] ? "Enable" : "Disable"} mod`;
            });
            header.appendChild(toggle);
            // Append new header
            content.appendChild(header);
            // Create and append new description.
            const description = document.createElement("description");
            description.className = "description-deemphasized zenThemeMarketplaceItemDescription";
            description.textContent = modData["description"];
            content.appendChild(description);
            // Append new content.
            item.appendChild(content);

            // Create new actions.
            const actions = document.createElement("hbox");
            actions.className = "zenThemeMarketplaceItemActions";

            // Create new dialog.
            const dialog = document.createElement("dialog");
            dialog.className = "zenThemeMarketplaceItemPreferenceDialog";

            if (modData.hasOwnProperty("preferences")) {
                // Create new top bar.
                const topbar = document.createElement("div");
                topbar.className = "zenThemeMarketplaceItemPreferenceDialogTopBar";
                topbar.innerHTML = `<h3 class="zenThemeMarketplaceItemTitle">${modData["name"]} (v${modData["version"]})</h3>`;
                // Create and append new close button.
                const close = document.createElement("button");
                close.textContent = "Close";
                close.addEventListener("click", () => dialog.close());
                topbar.appendChild(close);
                // Append new top bar.
                dialog.appendChild(topbar);
                // Create new preferences content.
                const prefs = document.createElement("div");
                prefs.className = "zenThemeMarketplaceItemPreferenceDialogContent";
                const modPrefs = await this.utils.getThemePreferences(modData);
                for (const pref of modPrefs) {
                    const prefEl = this.parsePrefs(pref);
                    if (prefEl && typeof prefEl !== "string") prefs.appendChild(prefEl);
                    if (pref.hasOwnProperty("conditions")) this.injectDynamicCSS(pref);
                }

                // Append new preferences content.
                dialog.appendChild(prefs);

                // Create and append new settings button.
                const settings = document.createElement("button");
                settings.className = "zenThemeMarketplaceItemConfigureButton";
                settings.title = "Open settings";
                settings.addEventListener("click", () => dialog.showModal());
                actions.appendChild(settings);
            }
            
            // Create and append new homepage button.
            const homepage = document.createElement("button");
            homepage.className = "zenThemeMarketplaceItemHomepageButton";
            homepage.addEventListener("click", () => window.open(modData["homepage"], "_blank"));
            homepage.title = "Visit homepage";
            actions.appendChild(homepage);
            // Create and append new updating button.
            const updateButton = document.createElement("button");
            updateButton.className = "auto-update-toggle";
            if (modData["no-updates"]) updateButton.setAttribute("enabled", true);
            updateButton.addEventListener("click", async () => {
                const installedMods = await this.utils.getThemes();
                if (installedMods[key]["no-updates"]) installedMods[key]["no-updates"] = false;
                else installedMods[key]["no-updates"] = true;
                if (!updateButton.getAttribute("enabled")) {
                    updateButton.setAttribute("enabled", true);
                    updateButton.title = "Enable updating for this mod";
                } else {
                    updateButton.removeAttribute("enabled");
                    updateButton.title = "Disable updating for this mod";
                }
                await IOUtils.writeJSON(this.utils.themesDataFile, installedMods);
            });
            updateButton.innerHTML = `<svg viewBox="-4 -4 32 32" id="update-disabled" data-name="Flat Line Disabled" xmlns="http://www.w3.org/2000/svg" class="icon flat-line"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path id="primary" d="M4,12A8,8,0,0,1,18.93,8" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><path id="primary-2" data-name="primary" d="M20,12A8,8,0,0,1,5.07,16" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><polyline id="primary-3" data-name="primary" points="14 8 19 8 19 3" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline><polyline id="primary-4" data-name="primary" points="10 16 5 16 5 21" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline><line x1="4" y1="4" x2="20" y2="20" stroke="#000000" stroke-width="2" stroke-linecap="round"/></g></svg>`;
            updateButton.title = `${modData["no-updates"] ? "Enable" : "Disable"} updating for this mod`;
            actions.appendChild(updateButton);
            // Create new remove mod button.
            const remove = document.createElement("button");
            remove.className = "zenThemeMarketplaceItemUninstallButton";
            remove.dataset.l10nId = "zen-theme-marketplace-remove-button";
            remove.addEventListener("click", async () => {
                if (window.confirm("Are you sure you want to remove this mod?")) {
                    remove.disabled = true;
                    await this.manager.removeTheme(modData["id"]);
                    this.manager._doNotRebuildThemesList = true;
                    await this.loadPage(document.querySelector("#sineInstallationList"), document.querySelector("#navigation-container"));
                    if (modData.hasOwnProperty("js"))
                        alert("A mod utilizing JS has been removed. For usage of it to be fully halted, restart your browser.");
                    await this.loadMods();
                }
            });
            // Create and append new remove mod child hbox.
            const removeChild = document.createElement("hbox");
            removeChild.className = "box-inherit button-box";
            removeChild.innerHTML = `<label class="button-box">Remove mod</label>`;
            remove.appendChild(removeChild);
            // Append new remove mod button.
            actions.appendChild(remove);
            // Append new actions.
            item.appendChild(actions);

            if (modData.hasOwnProperty("preferences"))
                item.appendChild(dialog);

            // Append item to the marketplace list.
            document.querySelector("#zenThemeMarketplaceList").appendChild(item);
        }
    },

    addToEditableFiles(editableFiles, path) {
        const parts = path.split("/");
        let currentLevel = editableFiles;
        for (let i = 0; i < parts.length - 1; i++) {
          const dirName = parts[i];
          let dirObj = currentLevel.find(item => typeof item === "object" && item.directory ===   dirName);
          if (!dirObj) {
            dirObj = { directory: dirName, contents: [] };
            currentLevel.push(dirObj);
          }
          currentLevel = dirObj.contents;
        }
        const fileName = parts[parts.length - 1];
        if (!currentLevel.includes(fileName)) {
          currentLevel.push(fileName);
        }
    },

    doesPathGoBehind(initialRelativePath, newRelativePath) {
        const cleanInitial = initialRelativePath.replace(/\/+$/, "");
        const cleanNewPath = newRelativePath.replace(/\/+$/, "");
          
        const initialSegments = cleanInitial ? cleanInitial.split("/").filter(segment => segment !== "") : [];
        const newPathSegments = cleanNewPath ? cleanNewPath.split("/").filter(segment => segment !== "") : [];

        let initialDepth = 0;
        for (const segment of initialSegments) {
            if (segment === "..") initialDepth--;
            else if (segment !== ".") initialDepth++;
        }
    
        let newDepth = 0;
        for (const segment of newPathSegments) {
            if (segment === "..") newDepth--;
            else if (segment !== ".") newDepth++;
        }

        const totalDepth = initialDepth + newDepth;
        return totalDepth < 0;
    },

    async processCSS(currentPath, cssContent, originalURL, mozDocumentRule, themeFolder, editableFiles) {
        originalURL = originalURL.split("/");
        originalURL.pop();
        const repoBaseUrl = originalURL.join("/") + "/";
        const importRegex = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])\s*;/g;

        const importMatches = [];
        let match;
        while ((match = importRegex.exec(cssContent)) !== null) {
            importMatches.push(match);
        }
    
        let actualCSS = "";
        if (importMatches.length > 0) {
            const lastImportEnd = importMatches[importMatches.length - 1].index + importMatches[importMatches.length - 1][0].length;
            actualCSS = cssContent.slice(lastImportEnd).trim();
        } else actualCSS = cssContent.trim();
    
        const importStatements = importMatches.map(match => match[0]);
        const imports = importMatches.map(match => match[1] || match[2]);
    
        for (const importPath of imports) {
            if (importPath.endsWith(".css") && !this.doesPathGoBehind(currentPath, importPath)) {
                const splicedPath = currentPath.split("/").slice(0, -1).join("/");
                const completePath = splicedPath ? splicedPath + "/" : splicedPath;
                const resolvedPath = completePath + importPath.replace(/(?<!\.)\.\//g, "");
                const fullUrl = new URL(resolvedPath, repoBaseUrl).href;
                const importedCss = await this.fetch(fullUrl);
                editableFiles = await this.processCSS(resolvedPath, importedCss, repoBaseUrl, mozDocumentRule, themeFolder, editableFiles);
            }
        }
    
        let newCssContent = importStatements.join("\n");
        if (actualCSS) {
            if (mozDocumentRule) newCssContent += `\n@-moz-document ${mozDocumentRule} {\n${actualCSS}  \n}`;
            else newCssContent += `\n${actualCSS}`;
        }
    
        // Add the current file to the editableFiles structure before writing
        this.addToEditableFiles(editableFiles, currentPath);
    
        if (this.os === "windows") currentPath = "\\" + currentPath.replace(/\//g, "\\");
        else currentPath = "/" + currentPath;
        await IOUtils.writeUTF8(themeFolder + currentPath, newCssContent);
        return editableFiles;
    },

    async processRootCSS(rootFileName, repoBaseUrl, themeFolder, editableFiles) {
        let mozDocumentRule;
        if (rootFileName === "userChrome") mozDocumentRule = "url-prefix(\"chrome:\")";
        if (rootFileName === "userContent") mozDocumentRule = "regexp(\"^(?!chrome:).*\")";
        const rootPath = `${rootFileName}.css`;
    
        const rootCss = await this.fetch(repoBaseUrl);
    
        await this.processCSS(rootPath, rootCss, repoBaseUrl, mozDocumentRule, themeFolder, editableFiles);
        return editableFiles;
    },

    async parseStyles(themeFolder, newThemeData) {
        await IOUtils.remove(PathUtils.join(themeFolder, "chrome.css"), { ignoreAbsent: true });
        await IOUtils.remove(PathUtils.join(themeFolder, "userChrome.css"), { ignoreAbsent: true });
        await IOUtils.remove(PathUtils.join(themeFolder, "userContent.css"), { ignoreAbsent: true });
        newThemeData["editable-files"] = [];
        let newCSSData = "";
        if (newThemeData["style"].hasOwnProperty("chrome") || newThemeData["style"].hasOwnProperty("content")) {
            if (newThemeData["style"].hasOwnProperty("chrome")) {
                newCSSData = `@import "./userChrome.css";`;
                let chrome = await this.fetch(newThemeData["style"]["chrome"]).catch(err => console.error(err));
                chrome = `@-moz-document url-prefix("chrome:") {\n  ${chrome}\n}`;
                newThemeData["editable-files"] = await this.processRootCSS("userChrome", newThemeData["style"]["chrome"], themeFolder, newThemeData["editable-files"]);
            } if (newThemeData["style"].hasOwnProperty("content")) {
                newCSSData += `\n@import "./userContent.css";`;
                let content = await this.fetch(newThemeData["style"]["content"]).catch(err => console.error(err));
                content = `@-moz-document regexp("^(?!chrome:).*") {\n  ${content}\n}`;
                newThemeData["editable-files"] = await this.processRootCSS("userContent", newThemeData["style"]["content"], themeFolder, newThemeData["editable-files"]);
            }
        } else {
            newCSSData = await this.fetch(newThemeData["style"]).catch(err => console.error(err));
            await this.processRootCSS("chrome", newThemeData["style"], themeFolder, newThemeData["editable-files"]);
        }
        await IOUtils.writeUTF8(PathUtils.join(themeFolder, "chrome.css"), newCSSData);
        newThemeData["editable-files"].push("chrome.css");
        return newThemeData["editable-files"];
    },

    generateRandomId() {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        const groupLength = 9;
        const numGroups = 3;
          
        const generateGroup = () => {
          let group = "";
          for (let i = 0; i < groupLength; i++) {
            const randomIndex = Math.floor(Math.random() * chars.length);
            group += chars[randomIndex];
          }
          return group;
        };
        
        const groups = [];
        for (let i = 0; i < numGroups; i++) {
          groups.push(generateGroup());
        }
        
        return groups.join("-");
    },

    async createThemeJSON(repo, theme={}, mainProcess=false) {
        const localFetch = async (url) => {
            let response;
            if (mainProcess) {
                response = await fetch(url).then(res => res.text());
                try {
                    response = JSON.parse(response);
                } catch {}
             } else response = await this.fetch(url);
             return response;
        }
        const translateToAPI = (input) => {
            const trimmedInput = input.trim().replace(/\/+$/, "");
            const regex = /(?:https?:\/\/github\.com\/)?([\w\-.]+)\/([\w\-.]+)/i;
            const match = trimmedInput.match(regex);
            if (!match) return null;
            const user = match[1];
            const repo = match[2];
            return `https://api.github.com/repos/${user}/${repo}`;
        }
        const notNull = (data) => {
            console.log(data);
            return data && (typeof data === "object" || data.toLowerCase() !== "404: not found");
        }
        const shouldApply = (property) => !theme.hasOwnProperty(property) ||
            ((property === "style" || property === "preferences" || property === "readme" || property === "image")
                && theme[property].startsWith("https://raw.githubusercontent.com/zen-browser/theme-store"));

        const repoRoot = this.rawURL(repo);
        console.log("CREATE DATA: ", translateToAPI(repo), repo, UC_API.Prefs.get("sine.no-internet"));
        const githubAPI = await localFetch(translateToAPI(repo));

        const setProperty = async (property, value, ifValue=true, nestedProperty=false, escapeNull=false) => {
            if (typeof ifValue === "string") ifValue = await localFetch(ifValue).then(res => notNull(res));
            if (notNull(value) && ifValue && (shouldApply(property) || escapeNull))
                if (!nestedProperty) theme[property] = value;
                else theme[property][nestedProperty] = value;
        }

        if (!mainProcess) {
            await setProperty("homepage", githubAPI.html_url);

            await setProperty("style", repoRoot + "chrome.css", `${repoRoot}chrome.css`);
            if (!theme.hasOwnProperty("style")) {
                theme["style"] = {};
                await setProperty("style", repoRoot + "userChrome.css", `${repoRoot}userChrome.css`, "chrome", true);
                await setProperty("style", repoRoot + "userContent.css", `${repoRoot}userContent.css`, "content", true);
            }
            await setProperty("preferences", repoRoot + "preferences.json", `${repoRoot}preferences.json`);
            await setProperty("readme", repoRoot + "README.md", `${repoRoot}README.md`);
            await setProperty("readme", repoRoot + "readme.md", `${repoRoot}readme.md`);
            let randomID = this.generateRandomId();
            const themes = await this.utils.getThemes();
            while (themes.hasOwnProperty(randomID)) {
                randomID = this.generateRandomId();
            }
            await setProperty("id", randomID);
            const silkthemesJSON = await localFetch(`${repoRoot}bento.json`);
            if (notNull(silkthemesJSON) && silkthemesJSON.hasOwnProperty("package")) {
                const silkPackage = silkthemesJSON["package"];
                await setProperty("name", silkPackage["name"]);
                await setProperty("author", silkPackage["author"]);
                await setProperty("version", silkPackage["version"]);
            } else {
                await setProperty("name", await githubAPI.name);
                await setProperty("version", "1.0.0");
            }
            await setProperty("description", githubAPI.description);
            await setProperty("createdAt", githubAPI.created_at);
        }
        await setProperty("updatedAt", githubAPI.updated_at);

        return theme;
    },

    async installMod(repo) {
        const currThemeData = await this.utils.getThemes();
    
        const newThemeData = await this.fetch(`${this.rawURL(repo)}theme.json`)
            .then(async res => typeof res !== "object" && res.toLowerCase() === "404: not found" ? 
                  await this.createThemeJSON(repo) : await this.createThemeJSON(repo, res));
        if (newThemeData) {
            const themeFolder = this.utils.getThemeFolder(newThemeData["id"]);
            if (newThemeData.hasOwnProperty("style")) {
                newThemeData["editable-files"] = await this.parseStyles(themeFolder, newThemeData);
            } if (newThemeData.hasOwnProperty("preferences")) {
                if (!newThemeData.hasOwnProperty("editable-files")) newThemeData["editable-files"] = [];
                const newPrefData = await this.fetch(newThemeData["preferences"], true).catch(err => console.error(err));
                await IOUtils.writeUTF8(PathUtils.join(themeFolder, "preferences.json"), newPrefData);
                newThemeData["editable-files"].push("preferences.json");
            } if (newThemeData.hasOwnProperty("readme")) {
                const newREADMEData = await this.fetch(newThemeData["readme"]).catch(err => console.error(err));
                await IOUtils.writeUTF8(PathUtils.join(themeFolder, "readme.md"), newREADMEData);
            } if (newThemeData.hasOwnProperty("js")) {
                const jsLink = `https://raw.githubusercontent.com/CosmoCreeper/Sine/main/mods/${newThemeData["id"]}/mod.uc.js`;
                const newJSData = await this.fetch(jsLink).catch(err => console.error(err));
                await IOUtils.writeUTF8(PathUtils.join(PathUtils.join(this.chromeDir, "JS"), `${newThemeData["id"]}.uc.js`), newJSData);
            }
        
            newThemeData["no-updates"] = false;
            newThemeData["enabled"] = true;
            currThemeData[newThemeData["id"]] = newThemeData;
            await IOUtils.writeJSON(this.utils.themesDataFile, currThemeData);

            await this.manager._triggerBuildUpdateWithoutRebuild();
            this.manager._doNotRebuildThemesList = true;
            if (newThemeData.hasOwnProperty("js"))
                alert("A mod utilizing JS has been installed. For it to work properly, restart your browser.");
            await this.loadMods();
        }
    },

    async checkForUpdates() {
        if (this.autoUpdates) {
            const currThemeData = await this.utils.getThemes();
            for (const key in currThemeData) {
                const currModData = currThemeData[key];
                let newThemeData;
                if (currModData.hasOwnProperty("homepage") && currModData["homepage"]) {
                    newThemeData = await fetch(`${this.rawURL(currModData["homepage"])}theme.json`).then(res => res.text()).catch(err => console.warn(err));
                    if (newThemeData) {
                        if (newThemeData.toLowerCase() === "404: not found")
                            newThemeData = await this.createThemeJSON(currModData["homepage"], {}, true);
                        else newThemeData = await this.createThemeJSON(currModData["homepage"], JSON.parse(newThemeData), true).catch(err => console.warn(err));
                        newThemeData["id"] = currModData["id"];
                    }
                } else
                    newThemeData = await this.fetch(`https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${this.rawURL(currModData["id"])}/theme.json`);
                
                if (currModData["enabled"] && !currModData["no-updates"] && new Date(currModData["updatedAt"]) < new Date(newThemeData["updatedAt"])) {
                    window.openPreferences();
                    break;
                }
            }
        }
    },

    async updateMods(source) {
        if ((source === "auto" && this.autoUpdates) || source === "manual") {
            const currThemeData = await this.utils.getThemes();
            let changeMade = false;
            let changeMadeHasJS = false;
            for (const key in currThemeData) {
                const currModData = currThemeData[key];
                let newThemeData;
                if (currModData.hasOwnProperty("homepage") && currModData["homepage"]) {
                    newThemeData = await this.fetch(`${this.rawURL(currModData["homepage"])}theme.json`);
                    let customData;
                    if (typeof newThemeData !== "object" && newThemeData.toLowerCase() === "404: not found") {
                        customData = await this.createThemeJSON(currModData["homepage"]);
                        if (currModData.hasOwnProperty("version")) customData["version"] = currModData["version"];
                    } else customData = await this.createThemeJSON(currModData["homepage"], newThemeData);
                    customData["id"] = currModData["id"];
                    
                    const addProp = (property) =>
                        !customData.hasOwnProperty(property) && currModData.hasOwnProperty(property) ?
                            customData[property] = currModData[property] : null;
                    addProp("style");
                    addProp("readme");
                    addProp("preferences");
                    addProp("image");
                    if (((typeof newThemeData !== "object" && newThemeData.toLowerCase() === "404: not found") || !newThemeData.hasOwnProperty("name")) && currModData.hasOwnProperty("name"))
                        customData["name"] = currModData["name"];
                    newThemeData = customData;
                } else
                    newThemeData = await this.fetch(`https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${this.rawURL(currModData["id"])}/theme.json`);
                
                if (newThemeData && typeof newThemeData === "object" && currModData["enabled"] && !currModData["no-updates"] && new Date(currModData["updatedAt"]) < new Date(newThemeData["updatedAt"])) {
                    changeMade = true;
                    const themeFolder = this.utils.getThemeFolder(newThemeData["id"]);
                    console.log("Auto-updating: " + currModData["name"] + "!");

                    if (newThemeData.hasOwnProperty("style")) {
                        newThemeData["editable-files"] = await this.parseStyles(themeFolder, newThemeData);
                    } else if (currModData.hasOwnProperty("style")) {
                        await IOUtils.remove(PathUtils.join(themeFolder, "chrome.css"));
                        await IOUtils.remove(PathUtils.join(themeFolder, "userChrome.css"), { ignoreAbsent: true });
                        await IOUtils.remove(PathUtils.join(themeFolder, "userContent.css"), { ignoreAbsent: true });
                    }

                    if (newThemeData.hasOwnProperty("preferences")) {
                        if (!newThemeData.hasOwnProperty("editable-files")) newThemeData["editable-files"] = [];
                        const newPrefData = await this.fetch(newThemeData["preferences"], true).catch(err => console.error(err));
                        await IOUtils.writeUTF8(PathUtils.join(themeFolder, "preferences.json"), newPrefData);
                        newThemeData["editable-files"].push("preferences.json");
                    } else if (currModData.hasOwnProperty("preferences")) {
                        await IOUtils.remove(PathUtils.join(themeFolder, "preferences.json"));
                    }

                    if (newThemeData.hasOwnProperty("readme")) {
                        const newREADMEData = await this.fetch(newThemeData["readme"]).catch(err => console.error(err));
                        await IOUtils.writeUTF8(PathUtils.join(themeFolder, "readme.md"), newREADMEData);
                    } else if (currModData.hasOwnProperty("readme")) {
                        await IOUtils.remove(PathUtils.join(themeFolder, "readme.md"));
                    }

                    if (newThemeData.hasOwnProperty("js")) {
                        const jsLink = `https://raw.githubusercontent.com/CosmoCreeper/Sine/main/mods/${newThemeData["id"]}/mod.uc.js`;
                        const newJSData = await this.fetch(jsLink).catch(err => console.error(err));
                        await IOUtils.writeUTF8(PathUtils.join(PathUtils.join(this.chromeDir, "JS"), `${newThemeData["id"]}.uc.js`), newJSData);
                        changeMadeHasJS = true;
                    } else if (currModData.hasOwnProperty("js")) {
                        await IOUtils.remove(PathUtils.join(PathUtils.join(this.chromeDir, "JS"), `${newThemeData["id"]}.uc.js`));
                        changeMadeHasJS = true;
                    }
                    
                    newThemeData["no-updates"] = false;
                    newThemeData["enabled"] = true;
                    currThemeData[newThemeData["id"]] = newThemeData;
                    await IOUtils.writeJSON(this.utils.themesDataFile, currThemeData);

                    await this.manager._triggerBuildUpdateWithoutRebuild();
                    this.manager._doNotRebuildThemesList = true;
                }
            }
            if (changeMadeHasJS) alert("A mod utilizing JS has been updated. For it to work properly, restart your browser.");;
            if (changeMade) await this.loadMods();
        }
    },

    applySiteStyles() {
        const globalStyleSheet = document.createElement("style");
        globalStyleSheet.textContent = `
            #zenThemeMarketplaceLink, #zenThemeMarketplaceCheckForUpdates, #ZenMarketplaceCategory[hidden] ~ #sineInstallationGroup,
            groupbox:popover-open .description-deemphasized:nth-of-type(2), groupbox:popover-open #sineInstallationCustom,
            #sineInstallationHeader button, .sineInstallationItem > img, .auto-update-toggle[enabled] + .manual-update {
                display: none;
            }
            #sineInstallationGroup {
                margin-bottom: 7px !important;
            }
            #sineInstallationGroup input:focus {
                border-color: transparent;
                box-shadow: 0 0 0 2px var(--zen-primary-color);
                outline: var(--focus-outline);
                outline-offset: var(--focus-outline-inset);
            }
            #sineInstallationHeader {
                display: flex;
                justify-content: space-between;
            }
            #ZenMarketplaceCategory:not([hidden]) ~ #sineInstallationGroup {
                display: block;
            }
            #sineInstallationGroup, #zenMarketplaceGroup {
                border-radius: 5px;
            }
            #sineInstallationList {
                display: grid;
                grid-template-columns: repeat(auto-fit, 196px);
                gap: 7px !important;
                margin-top: 17px;
                max-height: 400px;
                overflow-y: auto;
                overflow-x: hidden;
                margin-bottom: 5px;
                width: 100%;
                box-sizing: border-box;
                padding: 4px;
            }
            .sineInstallationItem {
                display: flex !important;
                flex-direction: column;
                border-radius: 5px !important;
                padding: 15px !important;
                background-color: rgba(255, 255, 255, 0.04) !important;
                box-shadow: 0 0 5px rgba(0, 0, 0, 0.2) !important;
                min-height: 200px;
                position: relative;
                width: 100%;
                box-sizing: border-box;
            }
            .sineInstallationItem[hidden], .sineInstallationItem[installed] {
                display: none !important;
            }
            .sineMarketplaceItemDescription {
                padding-bottom: 10px;
            }
            .sineMarketplaceButtonContainer {
                display: flex !important;
                margin-top: auto;
                height: 43px;
            }
            .sineMarketplaceOpenButton {
                display: inline-flex !important;
                width: 25%;
                align-items: center;
                justify-content: center;
                font-size: 0;
                min-width: 36px;
            }
            .sineMarketplaceOpenButton svg {
                width: 50%;
                height: 50%;
            }
            #sineInstallationCustom .sineMarketplaceOpenButton {
                width: 37px;
            }
            #sineInstallationCustom .zenThemeMarketplaceItemConfigureButton {
                margin-left: auto;
            }
            .sineMarketplaceItemButton {
                background-color: var(--color-accent-primary) !important;
                color: black !important;
                width: 100%;
            }
            #sineInstallationCustom {
                margin-top: 8px;
                display: flex;
            }
            #sineInstallationCustom .sineMarketplaceItemButton {
                width: unset;
                margin-left: 0;
            }
            #sineInstallationCustom>*:not(dialog) {
                box-sizing: border-box;
                height: 37px;
            }
            #sineInstallationCustom input {
                margin-left: 0;
                margin-right: 6px;
                margin-top: 4px;
            }
            .zenThemeMarketplaceItemTitle {
                margin: 0;
            }
            dialog::backdrop, #sineInstallationGroup:popover-open::backdrop {
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(3px);
            }
            dialog {
                border-radius: 5px;
                width: fit-content;
                max-height: 96vh;
                max-width: 96vw;
                animation: dialogPopin 0.3s ease-out;
                overflow-y: scroll;
                overflow-x: hidden;
                display: none !important;
                padding: 20px !important;
                box-sizing: border-box;
            }
            dialog[open] {
                display: block !important;
            }
            .zenThemeMarketplaceItemPreferenceDialogTopBar {
                align-items: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.3);
                padding-bottom: 7px;
                margin-bottom: 7px;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent {
                display: block;
                max-width: calc(96vw - 40px);
                width: max-content;
                min-width: 100%;
            }
            .zenThemeMarketplaceItemPreferenceCheckbox {
                margin: var(--space-small) 0;
                margin-right: 10px;
                padding-inline-start: 0;
                align-items: center;
                display: flex;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent div:has(hr) {
                position: relative;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent div:has(hr) * {
                transition: all 150ms ease;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent div hr:has(+ .separator-label[title]:not([checked])) {
                opacity: 0.5;
            }
            .separator-label {
                position: absolute;
                top: 50%;
                margin-left: 14px;
                background: var(--zen-dialog-background);
                padding: 0 6px 0 5px;
                transform: translateY(-60%);
            }
            .separator-label[title]:not([checked]), .separator-label[title][checked]:hover, .separator-label:not([title]) {
                color: rgba(255, 255, 255, 0.5);
            }
            .separator-label[title]:not([checked]):hover {
                color: white;
            }
            svg {
                fill: white;
            }
            #sineMarketplaceRefreshButton {
                margin: 0 0 0 6px !important;
            }
            #sineMarketplaceRefreshButton, #sineMarketplaceRefreshButton svg {
                height: 37px !important;
                width: 37px !important;
            }
            #sineInstallationGroup:popover-open {
                border: 0;
                position: fixed;
                top: 50%;
                translate: 0% -50%;
                background: var(--zen-dialog-background) !important;
                width: 80vw;
                max-height: 96vh;
                animation: dialogPopin 0.3s ease-out;

                #sineInstallationHeader button {
                    display: block;
                }
                #sineInstallationHeader button {
                    margin: 0 !important;
                }
                #sineInstallationHeader #sineMarketplaceRefreshButton {
                    margin: 0 6px 0 6px !important;
                }
                .sineInstallationItem {
                    min-height: 400px;
                }
                #sineInstallationList {
                    max-height: 80vh;
                    overflow-y: scroll;
                    grid-template-columns: repeat(auto-fit, 306px);
                }
                .sineInstallationItem > img {
                    display: block;
                    border-radius: 8px;
                    box-shadow: 0 0 4px rgba(255, 255, 255, 0.2);
                    height: auto;
                    max-height: 20vh;
                    object-fit: contain;
                    max-height: 40vh;
                }
            }
            #navigation-container {
                display: flex;
                justify-content: center;
            }
            #sineInstallationGroup:not(:popover-open) #navigation-container {
                margin-bottom: 8px;
            }
            #zenMarketplaceGroup .indent {
                margin: 0 !important;
            }
            .updates-container {
                display: flex;
            }
            .updates-container *, .updates-container {
                height: 32px;
            }
            .auto-update-toggle, .manual-update {
                cursor: pointer;
            }
            .auto-update-toggle {
                min-width: 0;
                padding: 0;
                width: 32px;
                height: 32px;
                color: white !important;
                display: flex;
                align-items: center;
            }
            .auto-update-toggle svg, #sineMarketplaceRefreshButton svg {
                filter: invert(1);
            }
            .auto-update-toggle[enabled] {
                background-color: var(--color-accent-primary) !important;
                color: black !important;
            }
            .updates-container .auto-update-toggle[enabled] {
                width: 135px;
            }
            .auto-update-toggle[enabled] svg {
                filter: invert(0);
            }
            .update-indicator {
                margin: 0;
                margin-top: 4px;
                margin-left: 4px;
                display: inline-flex;
            }
            .update-indicator p {
                line-height: 32px;
                margin: 0;
                margin-left: 7px;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent > * {
                padding: 5px;
                width: 100%;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent > *:has(hr) {
                padding: 5px 5px 5px 0;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent hbox {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent hbox menulist, .zenThemeMarketplaceItemPreferenceDialogContent hbox input {
                display: flex;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent hbox label {
                margin-right: 10px;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent > p {
                padding: 0;
                margin: 0;
            }
            @media (prefers-color-scheme: light) {
                .sineMarketplaceItemButton {
                    color: white !important;
                }
                svg {
                    fill: black;
                }
                .separator-label:not([checked]), .separator-label[checked]:hover {
                    color: rgba(0, 0, 0, 0.5);
                }
                .separator-label:not([checked]):hover {
                    color: black;
                }
                .sineInstallationItem {
                    background-color: rgba(0, 0, 0, 0.04) !important;
                    box-shadow: 0 0 5px rgba(255, 255, 255, 0.2) !important;
                }
                .auto-update-toggle svg, #sineMarketplaceRefreshButton svg {
                    filter: invert(0);
                }
                .auto-update-toggle {
                    color: black !important;
                }
                .auto-update-toggle[enabled] svg {
                    filter: invert(1);
                }
                .auto-update-toggle[enabled] {
                    color: white !important;
                }
                .zenThemeMarketplaceItemPreferenceDialogTopBar {
                    border-color: rgba(0, 0, 0, 0.3);
                }
            }
        `;
        globalStyleSheet.textContent += markedStyles;
        document.head.appendChild(globalStyleSheet);
    },

    parseMD(markdown, repoBaseUrl) {
        const renderer = new marked.Renderer();
        
        renderer.image = (href, title, text) => {
            if (!href.match(/^https?:\/\//) && !href.startsWith("//")) href = `${repoBaseUrl}/${href}`;
            const titleAttr = title ? `title="${title}"` : "";
            return `<img src="${href}" alt="${text}" ${titleAttr} />`;
        };

        renderer.link = (href, title, text) => {
            if (!href.match(/^https?:\/\//) && !href.startsWith("//")) {
                const isRelativePath = href.includes("/") || /\.(md|html|htm|png|jpg|jpeg|gif|svg|pdf)$/i.test(href);
                if (isRelativePath) href = `${repoBaseUrl}/${href}`;
                else href = `https://${href}`;
            }
            const titleAttr = title ? `title="${title}"` : "";
            return `<a href="${href}" ${titleAttr}>${text}</a>`;
        };

        marked.setOptions({
          gfm: true,
          renderer: renderer
        });

        let htmlContent = marked.parse(markdown);
        htmlContent = htmlContent.replace(/<img([^>]*?)(?<!\/)>/gi, "<img$1 />")
            .replace(/<hr([^>]*?)(?<!\/)>/gi, "<hr$1 />");
        return htmlContent;
    },

    currentPage: 0,

    // Load and render items for the current page
    async loadPage(newList, navContainer) {
        newList.innerHTML = "";

        // Calculate pagination
        const itemsPerPage = 6;
        const installedMods = await this.utils.getThemes();
        const items = this.searchQuery ? this.filteredItems : this.allItems;
        const availableItems = items.filter(item => !installedMods[item.key]);
        const totalItems = availableItems.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const currentPage = Math.max(0, Math.min(this.currentPage, totalPages - 1));
        const start = currentPage * itemsPerPage;
        const end = Math.min(start + itemsPerPage, totalItems);
        const currentItems = availableItems.slice(start, end);

        // Render items for the current page
        for (const { key, data } of currentItems) {
            // Create item
            const newItem = document.createElement("vbox");
            newItem.className = "sineInstallationItem";

            // Add image
            if (data["image"]) {
                const newItemImage = document.createElement("img");
                newItemImage.src = data["image"];
                newItem.appendChild(newItemImage);
            }

            // Add header
            const newItemHeader = document.createElement("hbox");
            newItemHeader.className = "sineMarketplaceItemHeader";
            newItemHeader.innerHTML = `
                <label>
                    <h3 class="sineMarketplaceItemTitle">${data["name"]} (v${data["version"]})</h3>
                </label>
            `;
            newItem.appendChild(newItemHeader);

            // Add description
            const newItemDescription = document.createElement("description");
            newItemDescription.className = "sineMarketplaceItemDescription";
            newItemDescription.textContent = data["description"];
            newItem.appendChild(newItemDescription);

            // Add button container
            const buttonContainer = document.createElement("hbox");
            buttonContainer.className = "sineMarketplaceButtonContainer";

            // Add readme dialog
            if (data["readme"]) {
                const dialog = document.createElement("dialog");
                dialog.className = "zenThemeMarketplaceItemPreferenceDialog";

                const topbar = document.createElement("div");
                topbar.className = "zenThemeMarketplaceItemPreferenceDialogTopBar";
                const close = document.createElement("button");
                close.textContent = "Close";
                close.addEventListener("click", () => dialog.close());
                close.style.marginLeft = "auto";
                topbar.appendChild(close);
                dialog.appendChild(topbar);

                const content = document.createElement("div");
                content.className = "zenThemeMarketplaceItemPreferenceDialogContent";
                const markdownBody = document.createElement("div");
                markdownBody.className = "markdown-body";
                content.appendChild(markdownBody);
                dialog.appendChild(content);
                newItem.appendChild(dialog);

                const newOpenButton = document.createElement("button");
                newOpenButton.className = "sineMarketplaceOpenButton";
                newOpenButton.addEventListener("click", async () => {
                    const themeMD = await this.fetch(data["readme"]).catch((err) => console.error(err));
                    let relativeURL = data["readme"].split("/");
                    relativeURL.pop();
                    relativeURL = relativeURL.join("/") + "/";
                    markdownBody.innerHTML = this.parseMD(themeMD, relativeURL);
                    dialog.showModal();
                });
                newOpenButton.innerHTML = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M29.693 25.849h-27.385c-1.271 0-2.307-1.036-2.307-2.307v-15.083c0-1.271 1.036-2.307 2.307-2.307h27.385c1.271 0 2.307 1.036 2.307 2.307v15.078c0 1.276-1.031 2.307-2.307 2.307zM7.693 21.229v-6l3.078 3.849 3.073-3.849v6h3.078v-10.458h-3.078l-3.073 3.849-3.078-3.849h-3.078v10.464zM28.307 16h-3.078v-5.229h-3.073v5.229h-3.078l4.615 5.385z"></path> </g></svg>`;
                buttonContainer.appendChild(newOpenButton);
            }

            // Add install button
            const newItemButton = document.createElement("button");
            newItemButton.className = "sineMarketplaceItemButton";
            newItemButton.addEventListener("click", async (e) => {
                newItemButton.disabled = true;
                e.target.parentElement.parentElement.setAttribute("installed", "true");
                await this.installMod(this.modGitHubs[key]);
                await this.loadPage(newList, navContainer);
            });
            newItemButton.textContent = "Install";
            buttonContainer.appendChild(newItemButton);
            newItem.appendChild(buttonContainer);
            newList.appendChild(newItem);

            // Check if installed
            const installedMods = await this.utils.getThemes();
            if (installedMods[key]) newItem.setAttribute("installed", "true");
        }

        // Update navigation controls
        navContainer.innerHTML = "";
        if (totalPages > 1) {
            const prevButton = document.createElement("button");
            prevButton.textContent = "Previous";
            prevButton.disabled = currentPage === 0;
            prevButton.addEventListener("click", () => {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.loadPage(newList, navContainer);
                }
            });

            const nextButton = document.createElement("button");
            nextButton.textContent = "Next";
            nextButton.disabled = currentPage >= totalPages - 1;
            nextButton.addEventListener("click", () => {
                if (this.currentPage < totalPages - 1) {
                    this.currentPage++;
                    this.loadPage(newList, navContainer);
                }
            });

            navContainer.appendChild(prevButton);
            navContainer.appendChild(nextButton);
        }
    },

    // Initialize marketplace
    async initMarketplace() {
        const refreshIcon = `<svg viewBox="-4 -4 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M12 20.75C10.0772 20.75 8.23311 19.9862 6.87348 18.6265C5.51384 17.2669 4.75 15.4228 4.75 13.5C4.75 11.5772 5.51384 9.73311 6.87348 8.37348C8.23311 7.01384 10.0772 6.25 12 6.25H14.5C14.6989 6.25 14.8897 6.32902 15.0303 6.46967C15.171 6.61032 15.25 6.80109 15.25 7C15.25 7.19891 15.171 7.38968 15.0303 7.53033C14.8897 7.67098 14.6989 7.75 14.5 7.75H12C10.8628 7.75 9.75105 8.08723 8.80547 8.71905C7.85989 9.35087 7.1229 10.2489 6.68769 11.2996C6.25249 12.3502 6.13862 13.5064 6.36048 14.6218C6.58235 15.7372 7.12998 16.7617 7.93414 17.5659C8.73829 18.37 9.76284 18.9177 10.8782 19.1395C11.9936 19.3614 13.1498 19.2475 14.2004 18.8123C15.2511 18.3771 16.1491 17.6401 16.781 16.6945C17.4128 15.7489 17.75 14.6372 17.75 13.5C17.75 13.3011 17.829 13.1103 17.9697 12.9697C18.1103 12.829 18.3011 12.75 18.5 12.75C18.6989 12.75 18.8897 12.829 19.0303 12.9697C19.171 13.1103 19.25 13.3011 19.25 13.5C19.2474 15.422 18.4827 17.2645 17.1236 18.6236C15.7645 19.9827 13.922 20.7474 12 20.75Z" fill="#000000"></path> <path d="M12 10.75C11.9015 10.7505 11.8038 10.7313 11.7128 10.6935C11.6218 10.6557 11.5392 10.6001 11.47 10.53C11.3296 10.3894 11.2507 10.1988 11.2507 10C11.2507 9.80128 11.3296 9.61066 11.47 9.47003L13.94 7.00003L11.47 4.53003C11.3963 4.46137 11.3372 4.37857 11.2962 4.28657C11.2552 4.19457 11.2332 4.09526 11.2314 3.99455C11.2296 3.89385 11.2482 3.79382 11.2859 3.70043C11.3236 3.60705 11.3797 3.52221 11.451 3.45099C11.5222 3.37977 11.607 3.32363 11.7004 3.28591C11.7938 3.24819 11.8938 3.22966 11.9945 3.23144C12.0952 3.23322 12.1945 3.25526 12.2865 3.29625C12.3785 3.33724 12.4613 3.39634 12.53 3.47003L15.53 6.47003C15.6705 6.61066 15.7493 6.80128 15.7493 7.00003C15.7493 7.19878 15.6705 7.38941 15.53 7.53003L12.53 10.53C12.4608 10.6001 12.3782 10.6557 12.2872 10.6935C12.1962 10.7313 12.0985 10.7505 12 10.75Z" fill="#000000"></path> </g></svg>`;
        const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check2" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0"/></svg>`;
        const updateIcon = `<svg viewBox="-3 -3 32 32" id="update" data-name="Flat Line" xmlns="http://www.w3.org/2000/svg" class="icon flat-line"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path id="primary" d="M4,12A8,8,0,0,1,18.93,8" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><path id="primary-2" data-name="primary" d="M20,12A8,8,0,0,1,5.07,16" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><polyline id="primary-3" data-name="primary" points="14 8 19 8 19 3" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline><polyline id="primary-4" data-name="primary" points="10 16 5 16 5 21" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline></g></svg>`;
        
        await this.waitForElm("#ZenMarketplaceCategory");
        document.querySelector("#ZenMarketplaceCategory h1").textContent = "Sine Mods";
        await this.waitForElm("#zenMarketplaceHeader h2");
        document.querySelector("#zenMarketplaceHeader h2").textContent = "Installed Mods";
        document.querySelector("#zenMarketplaceGroup .description-deemphasized").textContent = "Sine Mods you have installed are listed here.";

        const updatesContainer = document.createElement("hbox");
        updatesContainer.className = "updates-container";
        const autoUpdateButton = document.createElement("button");
        autoUpdateButton.className = "auto-update-toggle";
        autoUpdateButton.addEventListener("click", () => {
            this.autoUpdates = !this.autoUpdates;
            if (this.autoUpdates) {
                autoUpdateButton.setAttribute("enabled", true);
                autoUpdateButton.title = "Disable auto-updating";
                autoUpdateButton.innerHTML = updateIcon + "Auto-Update";
            } else {
                autoUpdateButton.removeAttribute("enabled");
                autoUpdateButton.title = "Enable auto-updating";
                autoUpdateButton.innerHTML = updateIcon;
            }
        });
        autoUpdateButton.innerHTML = updateIcon;
        if (this.autoUpdates) {
            autoUpdateButton.setAttribute("enabled", true);
            autoUpdateButton.innerHTML += "Auto-Update";
        }
        autoUpdateButton.title = `${this.autoUpdates ? "Disable" : "Enable"} auto-updating`;
        updatesContainer.appendChild(autoUpdateButton);
        const updateIndicator = document.createElement("div");
        updateIndicator.className = "update-indicator";
        if (this.autoUpdates) updateIndicator.innerHTML = `${checkIcon}<p>Up-to-date</p>`;
        const manualUpdateButton = document.createElement("button");
        manualUpdateButton.className = "manual-update";
        manualUpdateButton.textContent = "Check for Updates";
        manualUpdateButton.addEventListener("click", async () => {
            updateIndicator.innerHTML = `${checkIcon}<p>...</p>`;
            await this.updateMods("manual");
            updateIndicator.innerHTML = `${checkIcon}<p>Up-to-date</p>`;
        });
        updatesContainer.appendChild(manualUpdateButton);
        updatesContainer.appendChild(updateIndicator);

        document.querySelector("#zenMarketplaceGroup .indent").insertBefore(updatesContainer, document.querySelector("#zenThemeMarketplaceImport"));

        // Create group
        const newGroup = document.createElement("groupbox");
        newGroup.id = "sineInstallationGroup";
        newGroup.className = "highlighting-group";

        // Create header
        const newHeader = document.createElement("hbox");
        newHeader.id = "sineInstallationHeader";
        newHeader.innerHTML = `<h2>Marketplace</h2>`;

        // Create search input
        const newInput = document.createElement("input");
        newInput.className = "zenCKSOption-input";
        newInput.placeholder = "Search...";
        let searchTimeout = null;
        newInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout); // Clear any pending search
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value.toLowerCase();
                this.currentPage = 0; // Reset to first page on search
                this.filteredItems = this.allItems.filter(item =>
                    item.data["name"].toLowerCase().includes(this.searchQuery)
                );
                this.loadPage(
                    document.querySelector("#sineInstallationList"),
                    document.querySelector("#navigation-container")
                );
            }, 300); // 300ms delay
        });
        newHeader.appendChild(newInput);

        // Create description
        const newDescription = document.createElement("description");
        newDescription.className = "description-deemphasized";
        newDescription.textContent = "Find and install mods from the store.";

        // Create list (grid)
        const newList = document.createElement("vbox");
        newList.id = "sineInstallationList";

        // Add navigation controls
        const navContainer = document.createElement("hbox");
        navContainer.id = "navigation-container";

        // Create refresh button
        const newRefresh = document.createElement("button");
        newRefresh.className = "sineMarketplaceOpenButton";
        newRefresh.id = "sineMarketplaceRefreshButton";
        newRefresh.innerHTML = refreshIcon;
        newRefresh.title = "Refresh marketplace";
        newRefresh.addEventListener("click", async () => {
            newRefresh.disabled = true;
            const latest = await this.fetch(this.storeURL).catch(err => console.warn(err));
            if (latest) {
                this.modGitHubs = latest.marketplace;
                await UC_API.SharedStorage.widgetCallbacks.set("transfer", JSON.stringify(this.modGitHubs));
                UC_API.Prefs.set("sine.no-internet", false);
                await this.loadPage(newList, navContainer);
            }
            newRefresh.disabled = false;
        });
        newHeader.appendChild(newRefresh);

        // Create close button
        const newClose = document.createElement("button");
        newClose.textContent = "Close";
        newClose.addEventListener("click", () => {
            newGroup.hidePopover();
            newGroup.removeAttribute("popover");
        });
        newHeader.appendChild(newClose);
        newGroup.appendChild(newHeader);

        newGroup.appendChild(newDescription);
        newGroup.appendChild(newList);
        newGroup.appendChild(navContainer);

        // Fetch and store all items
        if (UC_API.Prefs.get("sine.no-internet")["value"]) {
            const latest = await this.fetch(this.storeURL).catch(err => console.warn(err));
            if (latest) {
                this.modGitHubs = latest.marketplace;
                await UC_API.SharedStorage.widgetCallbacks.set("transfer", JSON.stringify(this.modGitHubs));
                UC_API.Prefs.set("sine.no-internet", false);
            }
        }

        if (this.modGitHubs) {
            const keys = Object.keys(this.modGitHubs);
            this.allItems = [];
            for (const key of keys) {
                const data = await this.fetch(`${this.rawURL(this.modGitHubs[key])}theme.json`).catch((err) => console.error(err));
                if (data) {
                    this.allItems.push({ key, data });
                }
            }
            this.filteredItems = [...this.allItems];
            await this.loadPage(newList, navContainer);
        }

        // Append custom mods description
        const newCustomDesc = document.createElement("description");
        newCustomDesc.className = "description-deemphasized";
        newCustomDesc.textContent = "or, add your own locally from a GitHub repo.";
        newGroup.appendChild(newCustomDesc);

        // Add custom mods section
        const newCustom = document.createElement("vbox");
        newCustom.id = "sineInstallationCustom";

        // Custom mods input
        const newCustomInput = document.createElement("input");
        newCustomInput.className = "zenCKSOption-input";
        newCustomInput.placeholder = "username/repo (folder if needed)";
        newCustom.appendChild(newCustomInput);

        // Custom mods button
        const newCustomButton = document.createElement("button");
        newCustomButton.className = "sineMarketplaceItemButton";
        newCustomButton.textContent = "Install";
        newCustomButton.addEventListener("click", async () => {
            newCustomButton.disabled = true;
            await this.installMod(newCustomInput.value);
            newCustomInput.value = "";
            await this.loadPage(newList, navContainer);
            newCustomButton.disabled = false;
        });
        newCustom.appendChild(newCustomButton);

        // Settings dialog
        const newSettingsDialog = document.createElement("dialog");
        newSettingsDialog.className = "zenThemeMarketplaceItemPreferenceDialog";
        
        // Settings top bar
        const newSettingsBar = document.createElement("div");
        newSettingsBar.className = "zenThemeMarketplaceItemPreferenceDialogTopBar";
        newSettingsBar.innerHTML += `<h3 class="zenMarketplaceItemTitle">Settings</h3>`;
        const newSettingsBarBtn = document.createElement("button");
        newSettingsBarBtn.textContent = "Close";
        newSettingsBarBtn.addEventListener("click", () => newSettingsDialog.close());
        newSettingsBar.appendChild(newSettingsBarBtn);
        newSettingsDialog.appendChild(newSettingsBar);

        // Settings content
        const newSettingsContent = document.createElement("div");
        newSettingsContent.className = "zenThemeMarketplaceItemPreferenceDialogContent";
        const settingPrefs = [
            {
                "type": "text",
                "label": "**Updates**",
                "margin": "10px 0 15px 0",
                "size": "20px"
            },
            {
                "type": "button",
                "label": "Check for Updates",
                "action": async () => {
                    const latest = await this.fetch(this.storeURL).then(res => res.json()).catch(err => console.warn(err));
                    if (latest && new Date(latest.updatedAt) > new Date(this.updatedAt)) {
                        await this.updateScript(false);
                        if (UC_API.Prefs.get("sine.script.auto-restart")["value"])
                            Services.startup.quit(Services.startup.eAttemptQuit | Services.startup.eRestart);
                        else
                            alert(`Sine has been updated to version ${latest.version}. Please restart your browser for these changes to take effect.`);
                    }
                },
                "indicator": checkIcon
            },
            {
                "type": "checkbox",
                "property": "sine.script.auto-update",
                "defaultValue": true,
                "label": "Enables script auto-updating."
            },
            {
                "type": "checkbox",
                "property": "sine.script.auto-restart",
                "label": "Automatically restarts when script updates are found."
            }
        ];
        for (const [idx, pref] of settingPrefs.entries()) {
            let prefEl = this.parsePrefs(pref);
            if (prefEl && typeof prefEl !== "string") newSettingsContent.appendChild(prefEl);
            else if (prefEl === "button") {
                const prefContainer = document.createElement("hbox");
                prefContainer.className = "updates-container";
                prefEl = document.createElement("button");
                prefEl.style.margin = "0";
                prefEl.textContent = pref["label"];
                prefEl.addEventListener("click", async () => {
                    prefEl.disabled = true;
                    if (pref.hasOwnProperty("indicator"))
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML = pref["indicator"] + "<p>...</p>";
                    await pref["action"]();
                    prefEl.disabled = false;
                    if (pref.hasOwnProperty("indicator"))
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML = pref["indicator"] + "<p>Up-to-date</p>";
                }); 
                prefContainer.appendChild(prefEl);
                if (pref.hasOwnProperty("indicator")) {
                    const indicator = document.createElement("div");
                    indicator.id = `btn-indicator-${idx}`;
                    indicator.className = "update-indicator";
                    prefContainer.appendChild(indicator);
                }
                newSettingsContent.appendChild(prefContainer);
            }
            if (pref.hasOwnProperty("conditions")) this.injectDynamicCSS(pref);
        }
        newSettingsDialog.appendChild(newSettingsContent);
        newCustom.appendChild(newSettingsDialog);

        // Settings button
        const newSettingsButton = document.createElement("button");
        newSettingsButton.className = "sineMarketplaceOpenButton zenThemeMarketplaceItemConfigureButton";
        newSettingsButton.title = "Open settings";
        newSettingsButton.addEventListener("click", () => newSettingsDialog.showModal());
        newCustom.appendChild(newSettingsButton);

        // Expand button
        const newExpandButton = document.createElement("button");
        newExpandButton.className = "sineMarketplaceOpenButton";
        newExpandButton.innerHTML = `<svg viewBox="0 0 32 32" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;" version="1.1" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:serif="http://www.serif.com/" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M7.539,26.475l6.849,-6.971c0.58,-0.591 0.572,-1.541 -0.019,-2.121c-0.591,-0.58 -1.541,-0.572 -2.121,0.019l-6.737,6.856c-0.007,-0.079 -0.011,-0.159 -0.011,-0.24c0,-0 -0,-7.018 -0,-7.018c-0,-0.828 -0.672,-1.5 -1.5,-1.5c-0.828,0 -1.5,0.672 -1.5,1.5l0,7.018c0,3.037 2.462,5.5 5.5,5.5c3.112,-0 6.905,-0 6.905,-0c0.828,-0 1.5,-0.673 1.5,-1.5c0,-0.828 -0.672,-1.5 -1.5,-1.5l-6.905,-0c-0.157,-0 -0.311,-0.015 -0.461,-0.043Z"></path><path d="M24.267,5.51l-7.056,7.181c-0.58,0.591 -0.571,1.541 0.019,2.122c0.591,0.58 1.541,0.571 2.121,-0.019l7.149,-7.277c0.031,0.156 0.047,0.318 0.047,0.483c-0,0 -0,6.977 -0,6.977c-0,0.828 0.672,1.5 1.5,1.5c0.828,0 1.5,-0.672 1.5,-1.5l-0,-6.977c-0,-3.038 -2.463,-5.5 -5.5,-5.5c-3.162,0 -7.047,0 -7.047,0c-0.828,0 -1.5,0.672 -1.5,1.5c0,0.828 0.672,1.5 1.5,1.5c0,0 3.885,0 7.047,0c0.074,-0 0.147,0.003 0.22,0.01Z"></path><g id="Icon"></g></g></svg>`;
        newExpandButton.title = "Expand marketplace";
        newExpandButton.addEventListener("click", () => {
            newGroup.setAttribute("popover", "manual");
            newGroup.showPopover();
        });
        newCustom.appendChild(newExpandButton);

        newGroup.appendChild(newCustom);

        // Append group to main preferences pane
        document.querySelector("#mainPrefPane").insertBefore(newGroup, document.querySelector("#zenMarketplaceGroup"));
    },

    async init() {
        this.applySiteStyles();
        await this.initMarketplace();
        await this.loadMods();
        await this.updateMods("auto");
        this.manager._doNotRebuildThemesList = true;
    },
}

switch (document.location.pathname) {
    case "settings":
    case "preferences":
        window.addEventListener("load", async () => {
            if (document.readyState === "complete") {
                document.querySelector("#category-zen-marketplace .category-name").textContent = "Sine";
                const listenerFunc = async () => {
                    if (!UC_API.Prefs.get("sine.no-internet")["value"])
                        Sine.modGitHubs = JSON.parse(await UC_API.SharedStorage.widgetCallbacks.get("transfer"));
                    Sine.init();
                }

                if (!UC_API.Prefs.get("sine.transfer-complete")["value"]) {
                    const listener = UC_API.Prefs.addListener("sine.transfer-complete", () => {
                        UC_API.Prefs.removeListener(listener);
                        listenerFunc();
                    });
                } else listenerFunc();
            }
        });
        break;
    case "/content/browser.xhtml":
        UC_API.Prefs.set("sine.transfer-complete", false);
        await Sine.initWindow();
        await Sine.checkForUpdates();
        const fetchFunc = async () => {
            const url = UC_API.Prefs.get("sine.fetch-url")["value"];
            let response = await fetch(url).then(res => res.text()).catch(err => console.warn(err));
            await UC_API.SharedStorage.widgetCallbacks.set("fetch-results", response);
            UC_API.Prefs.removeListener(fetchListener);
            UC_API.Prefs.set("sine.fetch-url", "none");
            fetchListener = UC_API.Prefs.addListener("sine.fetch-url", fetchFunc);
        }
        UC_API.Prefs.set("sine.fetch-url", "none");
        let fetchListener = UC_API.Prefs.addListener("sine.fetch-url", fetchFunc);
        const processFunc = async () => {
            const process = UC_API.Prefs.get("sine.process")["value"];
            switch (process) {
                // FUTURE PURPOSES.
            }
            UC_API.Prefs.set("sine.process", "none");
        }
        UC_API.Prefs.addListener("sine.process", processFunc);
        if (Sine.modGitHubs) {
            await UC_API.SharedStorage.widgetCallbacks.set("transfer", JSON.stringify(Sine.modGitHubs));
            UC_API.Prefs.set("sine.no-internet", false);
        } else {
            UC_API.Prefs.set("sine.no-internet", true);
        }
        UC_API.Prefs.set("sine.transfer-complete", true);
        break;
}


// Marked parser and style imports.
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).marked={})}(this,function(r){"use strict";function i(e,t){for(var u=0;u<t.length;u++){var n=t[u];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(e,n.key,n)}}function s(e,t){(null==t||t>e.length)&&(t=e.length);for(var u=0,n=new Array(t);u<t;u++)n[u]=e[u];return n}function D(e,t){var u="undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(u)return(u=u.call(e)).next.bind(u);if(Array.isArray(e)||(u=function(e,t){if(e){if("string"==typeof e)return s(e,t);var u=Object.prototype.toString.call(e).slice(8,-1);return"Map"===(u="Object"===u&&e.constructor?e.constructor.name:u)||"Set"===u?Array.from(e):"Arguments"===u||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(u)?s(e,t):void 0}}(e))||t&&e&&"number"==typeof e.length){u&&(e=u);var n=0;return function(){return n>=e.length?{done:!0}:{done:!1,value:e[n++]}}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}function e(){return{baseUrl:null,breaks:!1,extensions:null,gfm:!0,headerIds:!0,headerPrefix:"",highlight:null,langPrefix:"language-",mangle:!0,pedantic:!1,renderer:null,sanitize:!1,sanitizer:null,silent:!1,smartLists:!1,smartypants:!1,tokenizer:null,walkTokens:null,xhtml:!1}}r.defaults=e();function u(e){return t[e]}var n=/[&<>"']/,l=/[&<>"']/g,a=/[<>"']|&(?!#?\w+;)/,o=/[<>"']|&(?!#?\w+;)/g,t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function c(e,t){if(t){if(n.test(e))return e.replace(l,u)}else if(a.test(e))return e.replace(o,u);return e}var h=/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/gi;function x(e){return e.replace(h,function(e,t){return"colon"===(t=t.toLowerCase())?":":"#"===t.charAt(0)?"x"===t.charAt(1)?String.fromCharCode(parseInt(t.substring(2),16)):String.fromCharCode(+t.substring(1)):""})}var p=/(^|[^\[])\^/g;function f(u,e){u=u.source||u,e=e||"";var n={replace:function(e,t){return t=(t=t.source||t).replace(p,"$1"),u=u.replace(e,t),n},getRegex:function(){return new RegExp(u,e)}};return n}var F=/[^\w:]/g,g=/^$|^[a-z][a-z0-9+.-]*:|^[?#]/i;function A(e,t,u){if(e){var n;try{n=decodeURIComponent(x(u)).replace(F,"").toLowerCase()}catch(e){return null}if(0===n.indexOf("javascript:")||0===n.indexOf("vbscript:")||0===n.indexOf("data:"))return null}t&&!g.test(u)&&(u=function(e,t){C[" "+e]||(d.test(e)?C[" "+e]=e+"/":C[" "+e]=w(e,"/",!0));var u=-1===(e=C[" "+e]).indexOf(":");return"//"===t.substring(0,2)?u?t:e.replace(k,"$1")+t:"/"===t.charAt(0)?u?t:e.replace(E,"$1")+t:e+t}(t,u));try{u=encodeURI(u).replace(/%25/g,"%")}catch(e){return null}return u}var C={},d=/^[^:]+:\/*[^/]*$/,k=/^([^:]+:)[\s\S]*$/,E=/^([^:]+:\/*[^/]*)[\s\S]*$/;var m={exec:function(){}};function B(e){for(var t,u,n=1;n<arguments.length;n++)for(u in t=arguments[n])Object.prototype.hasOwnProperty.call(t,u)&&(e[u]=t[u]);return e}function b(e,t){var u=e.replace(/\|/g,function(e,t,u){for(var n=!1,r=t;0<=--r&&"\\"===u[r];)n=!n;return n?"|":" |"}).split(/ \|/),n=0;if(u[0].trim()||u.shift(),u[u.length-1].trim()||u.pop(),u.length>t)u.splice(t);else for(;u.length<t;)u.push("");for(;n<u.length;n++)u[n]=u[n].trim().replace(/\\\|/g,"|");return u}function w(e,t,u){var n=e.length;if(0===n)return"";for(var r=0;r<n;){var i=e.charAt(n-r-1);if(i!==t||u){if(i===t||!u)break;r++}else r++}return e.substr(0,n-r)}function v(e){e&&e.sanitize&&!e.silent&&console.warn("marked(): sanitize and sanitizer parameters are deprecated since version 0.7.0, should not be used and will be removed in the future. Read more here: https://marked.js.org/#/USING_ADVANCED.md#options")}function y(e,t){if(t<1)return"";for(var u="";1<t;)1&t&&(u+=e),t>>=1,e+=e;return u+e}function _(e,t,u,n){var r=t.href,i=t.title?c(t.title):null,t=e[1].replace(/\\([\[\]])/g,"$1");if("!"===e[0].charAt(0))return{type:"image",raw:u,href:r,title:i,text:c(t)};n.state.inLink=!0;t={type:"link",raw:u,href:r,title:i,text:t,tokens:n.inlineTokens(t,[])};return n.state.inLink=!1,t}var z=function(){function e(e){this.options=e||r.defaults}var t=e.prototype;return t.space=function(e){e=this.rules.block.newline.exec(e);if(e)return 1<e[0].length?{type:"space",raw:e[0]}:{raw:"\n"}},t.code=function(e){var t=this.rules.block.code.exec(e);if(t){e=t[0].replace(/^ {1,4}/gm,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?e:w(e,"\n")}}},t.fences=function(e){var t=this.rules.block.fences.exec(e);if(t){var u=t[0],e=function(e,t){if(null===(e=e.match(/^(\s+)(?:```)/)))return t;var u=e[1];return t.split("\n").map(function(e){var t=e.match(/^\s+/);return null!==t&&t[0].length>=u.length?e.slice(u.length):e}).join("\n")}(u,t[3]||"");return{type:"code",raw:u,lang:t[2]&&t[2].trim(),text:e}}},t.heading=function(e){var t=this.rules.block.heading.exec(e);if(t){var u=t[2].trim();/#$/.test(u)&&(e=w(u,"#"),!this.options.pedantic&&e&&!/ $/.test(e)||(u=e.trim()));u={type:"heading",raw:t[0],depth:t[1].length,text:u,tokens:[]};return this.lexer.inline(u.text,u.tokens),u}},t.hr=function(e){e=this.rules.block.hr.exec(e);if(e)return{type:"hr",raw:e[0]}},t.blockquote=function(e){var t=this.rules.block.blockquote.exec(e);if(t){e=t[0].replace(/^ *> ?/gm,"");return{type:"blockquote",raw:t[0],tokens:this.lexer.blockTokens(e,[]),text:e}}},t.list=function(e){var t=this.rules.block.list.exec(e);if(t){var u,n,r,i,s,l,a,D,o,c=1<(p=t[1].trim()).length,h={type:"list",raw:"",ordered:c,start:c?+p.slice(0,-1):"",loose:!1,items:[]},p=c?"\\d{1,9}\\"+p.slice(-1):"\\"+p;this.options.pedantic&&(p=c?p:"[*+-]");for(var f=new RegExp("^( {0,3}"+p+")((?: [^\\n]*| *)(?:\\n[^\\n]*)*(?:\\n|$))");e&&!this.rules.block.hr.test(e)&&(t=f.exec(e));){D=t[2].split("\n"),o=this.options.pedantic?(i=2,D[0].trimLeft()):(i=t[2].search(/[^ ]/),i=t[1].length+(4<i?1:i),D[0].slice(i-t[1].length)),s=!1,u=t[0],!D[0]&&/^ *$/.test(D[1])&&(u=t[1]+D.slice(0,2).join("\n")+"\n",h.loose=!0,D=[]);for(var F=new RegExp("^ {0,"+Math.min(3,i-1)+"}(?:[*+-]|\\d{1,9}[.)])"),g=1;g<D.length;g++){if(a=D[g],this.options.pedantic&&(a=a.replace(/^ {1,4}(?=( {4})*[^ ])/g,"  ")),F.test(a)){u=t[1]+D.slice(0,g).join("\n")+"\n";break}if(s){if(!(a.search(/[^ ]/)>=i)&&a.trim()){u=t[1]+D.slice(0,g).join("\n")+"\n";break}o+="\n"+a.slice(i)}else a.trim()||(s=!0),a.search(/[^ ]/)>=i?o+="\n"+a.slice(i):o+="\n"+a}h.loose||(l?h.loose=!0:/\n *\n *$/.test(u)&&(l=!0)),this.options.gfm&&(n=/^\[[ xX]\] /.exec(o))&&(r="[ ] "!==n[0],o=o.replace(/^\[[ xX]\] +/,"")),h.items.push({type:"list_item",raw:u,task:!!n,checked:r,loose:!1,text:o}),h.raw+=u,e=e.slice(u.length)}h.items[h.items.length-1].raw=u.trimRight(),h.items[h.items.length-1].text=o.trimRight(),h.raw=h.raw.trimRight();var A=h.items.length;for(g=0;g<A;g++)this.lexer.state.top=!1,h.items[g].tokens=this.lexer.blockTokens(h.items[g].text,[]),h.items[g].tokens.some(function(e){return"space"===e.type})&&(h.loose=!0,h.items[g].loose=!0);return h}},t.html=function(e){var t=this.rules.block.html.exec(e);if(t){e={type:"html",raw:t[0],pre:!this.options.sanitizer&&("pre"===t[1]||"script"===t[1]||"style"===t[1]),text:t[0]};return this.options.sanitize&&(e.type="paragraph",e.text=this.options.sanitizer?this.options.sanitizer(t[0]):c(t[0]),e.tokens=[],this.lexer.inline(e.text,e.tokens)),e}},t.def=function(e){e=this.rules.block.def.exec(e);if(e)return e[3]&&(e[3]=e[3].substring(1,e[3].length-1)),{type:"def",tag:e[1].toLowerCase().replace(/\s+/g," "),raw:e[0],href:e[2],title:e[3]}},t.table=function(e){e=this.rules.block.table.exec(e);if(e){var t={type:"table",header:b(e[1]).map(function(e){return{text:e}}),align:e[2].replace(/^ *|\| *$/g,"").split(/ *\| */),rows:e[3]?e[3].replace(/\n$/,"").split("\n"):[]};if(t.header.length===t.align.length){t.raw=e[0];for(var u,n,r,i=t.align.length,s=0;s<i;s++)/^ *-+: *$/.test(t.align[s])?t.align[s]="right":/^ *:-+: *$/.test(t.align[s])?t.align[s]="center":/^ *:-+ *$/.test(t.align[s])?t.align[s]="left":t.align[s]=null;for(i=t.rows.length,s=0;s<i;s++)t.rows[s]=b(t.rows[s],t.header.length).map(function(e){return{text:e}});for(i=t.header.length,u=0;u<i;u++)t.header[u].tokens=[],this.lexer.inlineTokens(t.header[u].text,t.header[u].tokens);for(i=t.rows.length,u=0;u<i;u++)for(r=t.rows[u],n=0;n<r.length;n++)r[n].tokens=[],this.lexer.inlineTokens(r[n].text,r[n].tokens);return t}}},t.lheading=function(e){e=this.rules.block.lheading.exec(e);if(e){e={type:"heading",raw:e[0],depth:"="===e[2].charAt(0)?1:2,text:e[1],tokens:[]};return this.lexer.inline(e.text,e.tokens),e}},t.paragraph=function(e){e=this.rules.block.paragraph.exec(e);if(e){e={type:"paragraph",raw:e[0],text:"\n"===e[1].charAt(e[1].length-1)?e[1].slice(0,-1):e[1],tokens:[]};return this.lexer.inline(e.text,e.tokens),e}},t.text=function(e){e=this.rules.block.text.exec(e);if(e){e={type:"text",raw:e[0],text:e[0],tokens:[]};return this.lexer.inline(e.text,e.tokens),e}},t.escape=function(e){e=this.rules.inline.escape.exec(e);if(e)return{type:"escape",raw:e[0],text:c(e[1])}},t.tag=function(e){e=this.rules.inline.tag.exec(e);if(e)return!this.lexer.state.inLink&&/^<a /i.test(e[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&/^<\/a>/i.test(e[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&/^<(pre|code|kbd|script)(\s|>)/i.test(e[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&/^<\/(pre|code|kbd|script)(\s|>)/i.test(e[0])&&(this.lexer.state.inRawBlock=!1),{type:this.options.sanitize?"text":"html",raw:e[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,text:this.options.sanitize?this.options.sanitizer?this.options.sanitizer(e[0]):c(e[0]):e[0]}},t.link=function(e){var t=this.rules.inline.link.exec(e);if(t){var u=t[2].trim();if(!this.options.pedantic&&/^</.test(u)){if(!/>$/.test(u))return;e=w(u.slice(0,-1),"\\");if((u.length-e.length)%2==0)return}else{var n=function(e,t){if(-1===e.indexOf(t[1]))return-1;for(var u=e.length,n=0,r=0;r<u;r++)if("\\"===e[r])r++;else if(e[r]===t[0])n++;else if(e[r]===t[1]&&--n<0)return r;return-1}(t[2],"()");-1<n&&(i=(0===t[0].indexOf("!")?5:4)+t[1].length+n,t[2]=t[2].substring(0,n),t[0]=t[0].substring(0,i).trim(),t[3]="")}var r,n=t[2],i="";return this.options.pedantic?(r=/^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(n))&&(n=r[1],i=r[3]):i=t[3]?t[3].slice(1,-1):"",n=n.trim(),_(t,{href:(n=/^</.test(n)?this.options.pedantic&&!/>$/.test(u)?n.slice(1):n.slice(1,-1):n)&&n.replace(this.rules.inline._escapes,"$1"),title:i&&i.replace(this.rules.inline._escapes,"$1")},t[0],this.lexer)}},t.reflink=function(e,t){if((u=this.rules.inline.reflink.exec(e))||(u=this.rules.inline.nolink.exec(e))){e=(u[2]||u[1]).replace(/\s+/g," ");if((e=t[e.toLowerCase()])&&e.href)return _(u,e,u[0],this.lexer);var u=u[0].charAt(0);return{type:"text",raw:u,text:u}}},t.emStrong=function(e,t,u){void 0===u&&(u="");var n=this.rules.inline.emStrong.lDelim.exec(e);if(n&&(!n[3]||!u.match(/(?:[0-9A-Za-z\xAA\xB2\xB3\xB5\xB9\xBA\xBC-\xBE\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u0660-\u0669\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088E\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0966-\u096F\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09E6-\u09F1\u09F4-\u09F9\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A66-\u0A6F\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AE6-\u0AEF\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B66-\u0B6F\u0B71-\u0B77\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0BE6-\u0BF2\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C66-\u0C6F\u0C78-\u0C7E\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDD\u0CDE\u0CE0\u0CE1\u0CE6-\u0CEF\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D58-\u0D61\u0D66-\u0D78\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DE6-\u0DEF\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F20-\u0F33\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F-\u1049\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u1090-\u1099\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1369-\u137C\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u17E0-\u17E9\u17F0-\u17F9\u1810-\u1819\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A16\u1A20-\u1A54\u1A80-\u1A89\u1A90-\u1A99\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B50-\u1B59\u1B83-\u1BA0\u1BAE-\u1BE5\u1C00-\u1C23\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2070\u2071\u2074-\u2079\u207F-\u2089\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2150-\u2189\u2460-\u249B\u24EA-\u24FF\u2776-\u2793\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2CFD\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u3192-\u3195\u31A0-\u31BF\u31F0-\u31FF\u3220-\u3229\u3248-\u324F\u3251-\u325F\u3280-\u3289\u32B1-\u32BF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA830-\uA835\uA840-\uA873\uA882-\uA8B3\uA8D0-\uA8D9\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA900-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF-\uA9D9\uA9E0-\uA9E4\uA9E6-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD07-\uDD33\uDD40-\uDD78\uDD8A\uDD8B\uDE80-\uDE9C\uDEA0-\uDED0\uDEE1-\uDEFB\uDF00-\uDF23\uDF2D-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDD70-\uDD7A\uDD7C-\uDD8A\uDD8C-\uDD92\uDD94\uDD95\uDD97-\uDDA1\uDDA3-\uDDB1\uDDB3-\uDDB9\uDDBB\uDDBC\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67\uDF80-\uDF85\uDF87-\uDFB0\uDFB2-\uDFBA]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC58-\uDC76\uDC79-\uDC9E\uDCA7-\uDCAF\uDCE0-\uDCF2\uDCF4\uDCF5\uDCFB-\uDD1B\uDD20-\uDD39\uDD80-\uDDB7\uDDBC-\uDDCF\uDDD2-\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE40-\uDE48\uDE60-\uDE7E\uDE80-\uDE9F\uDEC0-\uDEC7\uDEC9-\uDEE4\uDEEB-\uDEEF\uDF00-\uDF35\uDF40-\uDF55\uDF58-\uDF72\uDF78-\uDF91\uDFA9-\uDFAF]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDCFA-\uDD23\uDD30-\uDD39\uDE60-\uDE7E\uDE80-\uDEA9\uDEB0\uDEB1\uDF00-\uDF27\uDF30-\uDF45\uDF51-\uDF54\uDF70-\uDF81\uDFB0-\uDFCB\uDFE0-\uDFF6]|\uD804[\uDC03-\uDC37\uDC52-\uDC6F\uDC71\uDC72\uDC75\uDC83-\uDCAF\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD03-\uDD26\uDD36-\uDD3F\uDD44\uDD47\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDD0-\uDDDA\uDDDC\uDDE1-\uDDF4\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDEF0-\uDEF9\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC50-\uDC59\uDC5F-\uDC61\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE50-\uDE59\uDE80-\uDEAA\uDEB8\uDEC0-\uDEC9\uDF00-\uDF1A\uDF30-\uDF3B\uDF40-\uDF46]|\uD806[\uDC00-\uDC2B\uDCA0-\uDCF2\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD2F\uDD3F\uDD41\uDD50-\uDD59\uDDA0-\uDDA7\uDDAA-\uDDD0\uDDE1\uDDE3\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE89\uDE9D\uDEB0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC50-\uDC6C\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46\uDD50-\uDD59\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD89\uDD98\uDDA0-\uDDA9\uDEE0-\uDEF2\uDFB0\uDFC0-\uDFD4]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|\uD80B[\uDF90-\uDFF0]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDE70-\uDEBE\uDEC0-\uDEC9\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF50-\uDF59\uDF5B-\uDF61\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE96\uDF00-\uDF4A\uDF50\uDF93-\uDF9F\uDFE0\uDFE1\uDFE3]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82B[\uDFF0-\uDFF3\uDFF5-\uDFFB\uDFFD\uDFFE]|\uD82C[\uDC00-\uDD22\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD834[\uDEE0-\uDEF3\uDF60-\uDF78]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD837[\uDF00-\uDF1E]|\uD838[\uDD00-\uDD2C\uDD37-\uDD3D\uDD40-\uDD49\uDD4E\uDE90-\uDEAD\uDEC0-\uDEEB\uDEF0-\uDEF9]|\uD839[\uDFE0-\uDFE6\uDFE8-\uDFEB\uDFED\uDFEE\uDFF0-\uDFFE]|\uD83A[\uDC00-\uDCC4\uDCC7-\uDCCF\uDD00-\uDD43\uDD4B\uDD50-\uDD59]|\uD83B[\uDC71-\uDCAB\uDCAD-\uDCAF\uDCB1-\uDCB4\uDD01-\uDD2D\uDD2F-\uDD3D\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD83C[\uDD00-\uDD0C]|\uD83E[\uDFF0-\uDFF9]|\uD869[\uDC00-\uDEDF\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF38\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A])/))){var r=n[1]||n[2]||"";if(!r||""===u||this.rules.inline.punctuation.exec(u)){var i,s=n[0].length-1,l=s,a=0,D="*"===n[0][0]?this.rules.inline.emStrong.rDelimAst:this.rules.inline.emStrong.rDelimUnd;for(D.lastIndex=0,t=t.slice(-1*e.length+s);null!=(n=D.exec(t));)if(i=n[1]||n[2]||n[3]||n[4]||n[5]||n[6])if(i=i.length,n[3]||n[4])l+=i;else if(!((n[5]||n[6])&&s%3)||(s+i)%3){if(!(0<(l-=i))){if(i=Math.min(i,i+l+a),Math.min(s,i)%2){var o=e.slice(1,s+n.index+i);return{type:"em",raw:e.slice(0,s+n.index+i+1),text:o,tokens:this.lexer.inlineTokens(o,[])}}o=e.slice(2,s+n.index+i-1);return{type:"strong",raw:e.slice(0,s+n.index+i+1),text:o,tokens:this.lexer.inlineTokens(o,[])}}}else a+=i}}},t.codespan=function(e){var t=this.rules.inline.code.exec(e);if(t){var u=t[2].replace(/\n/g," "),n=/[^ ]/.test(u),e=/^ /.test(u)&&/ $/.test(u),u=c(u=n&&e?u.substring(1,u.length-1):u,!0);return{type:"codespan",raw:t[0],text:u}}},t.br=function(e){e=this.rules.inline.br.exec(e);if(e)return{type:"br",raw:e[0]}},t.del=function(e){e=this.rules.inline.del.exec(e);if(e)return{type:"del",raw:e[0],text:e[2],tokens:this.lexer.inlineTokens(e[2],[])}},t.autolink=function(e,t){e=this.rules.inline.autolink.exec(e);if(e){var u,t="@"===e[2]?"mailto:"+(u=c(this.options.mangle?t(e[1]):e[1])):u=c(e[1]);return{type:"link",raw:e[0],text:u,href:t,tokens:[{type:"text",raw:u,text:u}]}}},t.url=function(e,t){var u,n,r,i;if(u=this.rules.inline.url.exec(e)){if("@"===u[2])r="mailto:"+(n=c(this.options.mangle?t(u[0]):u[0]));else{for(;i=u[0],u[0]=this.rules.inline._backpedal.exec(u[0])[0],i!==u[0];);n=c(u[0]),r="www."===u[1]?"http://"+n:n}return{type:"link",raw:u[0],text:n,href:r,tokens:[{type:"text",raw:n,text:n}]}}},t.inlineText=function(e,t){e=this.rules.inline.text.exec(e);if(e){t=this.lexer.state.inRawBlock?this.options.sanitize?this.options.sanitizer?this.options.sanitizer(e[0]):c(e[0]):e[0]:c(this.options.smartypants?t(e[0]):e[0]);return{type:"text",raw:e[0],text:t}}},e}(),$={newline:/^(?: *(?:\n|$))+/,code:/^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,fences:/^ {0,3}(`{3,}(?=[^`\n]*\n)|~{3,})([^\n]*)\n(?:|([\s\S]*?)\n)(?: {0,3}\1[~`]* *(?=\n|$)|$)/,hr:/^ {0,3}((?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})(?:\n+|$)/,heading:/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,blockquote:/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/,list:/^( {0,3}bull)( [^\n]+?)?(?:\n|$)/,html:"^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$))",def:/^ {0,3}\[(label)\]: *\n? *<?([^\s>]+)>?(?:(?: +\n? *| *\n *)(title))? *(?:\n+|$)/,table:m,lheading:/^([^\n]+)\n {0,3}(=+|-+) *(?:\n+|$)/,_paragraph:/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html| +\n)[^\n]+)*)/,text:/^[^\n]+/,_label:/(?!\s*\])(?:\\[\[\]]|[^\[\]])+/,_title:/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/};$.def=f($.def).replace("label",$._label).replace("title",$._title).getRegex(),$.bullet=/(?:[*+-]|\d{1,9}[.)])/,$.listItemStart=f(/^( *)(bull) */).replace("bull",$.bullet).getRegex(),$.list=f($.list).replace(/bull/g,$.bullet).replace("hr","\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))").replace("def","\\n+(?="+$.def.source+")").getRegex(),$._tag="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",$._comment=/<!--(?!-?>)[\s\S]*?(?:-->|$)/,$.html=f($.html,"i").replace("comment",$._comment).replace("tag",$._tag).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),$.paragraph=f($._paragraph).replace("hr",$.hr).replace("heading"," {0,3}#{1,6} ").replace("|lheading","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",$._tag).getRegex(),$.blockquote=f($.blockquote).replace("paragraph",$.paragraph).getRegex(),$.normal=B({},$),$.gfm=B({},$.normal,{table:"^ *([^\\n ].*\\|.*)\\n {0,3}(?:\\| *)?(:?-+:? *(?:\\| *:?-+:? *)*)(?:\\| *)?(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)"}),$.gfm.table=f($.gfm.table).replace("hr",$.hr).replace("heading"," {0,3}#{1,6} ").replace("blockquote"," {0,3}>").replace("code"," {4}[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",$._tag).getRegex(),$.pedantic=B({},$.normal,{html:f("^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:\"[^\"]*\"|'[^']*'|\\s[^'\"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))").replace("comment",$._comment).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:m,paragraph:f($.normal._paragraph).replace("hr",$.hr).replace("heading"," *#{1,6} *[^\n]").replace("lheading",$.lheading).replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").getRegex()});var S={escape:/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,autolink:/^<(scheme:[^\s\x00-\x1f<>]*|email)>/,url:m,tag:"^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>",link:/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/,reflink:/^!?\[(label)\]\[(?!\s*\])((?:\\[\[\]]?|[^\[\]\\])+)\]/,nolink:/^!?\[(?!\s*\])((?:\[[^\[\]]*\]|\\[\[\]]|[^\[\]])*)\](?:\[\])?/,reflinkSearch:"reflink|nolink(?!\\()",emStrong:{lDelim:/^(?:\*+(?:([punct_])|[^\s*]))|^_+(?:([punct*])|([^\s_]))/,rDelimAst:/^[^_*]*?\_\_[^_*]*?\*[^_*]*?(?=\_\_)|[punct_](\*+)(?=[\s]|$)|[^punct*_\s](\*+)(?=[punct_\s]|$)|[punct_\s](\*+)(?=[^punct*_\s])|[\s](\*+)(?=[punct_])|[punct_](\*+)(?=[punct_])|[^punct*_\s](\*+)(?=[^punct*_\s])/,rDelimUnd:/^[^_*]*?\*\*[^_*]*?\_[^_*]*?(?=\*\*)|[punct*](\_+)(?=[\s]|$)|[^punct*_\s](\_+)(?=[punct*\s]|$)|[punct*\s](\_+)(?=[^punct*_\s])|[\s](\_+)(?=[punct*])|[punct*](\_+)(?=[punct*])/},code:/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,br:/^( {2,}|\\)\n(?!\s*$)/,del:m,text:/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,punctuation:/^([\spunctuation])/};function T(e){return e.replace(/---/g,"—").replace(/--/g,"–").replace(/(^|[-\u2014/(\[{"\s])'/g,"$1‘").replace(/'/g,"’").replace(/(^|[-\u2014/(\[{\u2018\s])"/g,"$1“").replace(/"/g,"”").replace(/\.{3}/g,"…")}function R(e){for(var t,u="",n=e.length,r=0;r<n;r++)t=e.charCodeAt(r),u+="&#"+(t=.5<Math.random()?"x"+t.toString(16):t)+";";return u}S._punctuation="!\"#$%&'()+\\-.,/:;<=>?@\\[\\]`^{|}~",S.punctuation=f(S.punctuation).replace(/punctuation/g,S._punctuation).getRegex(),S.blockSkip=/\[[^\]]*?\]\([^\)]*?\)|`[^`]*?`|<[^>]*?>/g,S.escapedEmSt=/\\\*|\\_/g,S._comment=f($._comment).replace("(?:--\x3e|$)","--\x3e").getRegex(),S.emStrong.lDelim=f(S.emStrong.lDelim).replace(/punct/g,S._punctuation).getRegex(),S.emStrong.rDelimAst=f(S.emStrong.rDelimAst,"g").replace(/punct/g,S._punctuation).getRegex(),S.emStrong.rDelimUnd=f(S.emStrong.rDelimUnd,"g").replace(/punct/g,S._punctuation).getRegex(),S._escapes=/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g,S._scheme=/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/,S._email=/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/,S.autolink=f(S.autolink).replace("scheme",S._scheme).replace("email",S._email).getRegex(),S._attribute=/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/,S.tag=f(S.tag).replace("comment",S._comment).replace("attribute",S._attribute).getRegex(),S._label=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,S._href=/<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/,S._title=/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/,S.link=f(S.link).replace("label",S._label).replace("href",S._href).replace("title",S._title).getRegex(),S.reflink=f(S.reflink).replace("label",S._label).getRegex(),S.reflinkSearch=f(S.reflinkSearch,"g").replace("reflink",S.reflink).replace("nolink",S.nolink).getRegex(),S.normal=B({},S),S.pedantic=B({},S.normal,{strong:{start:/^__|\*\*/,middle:/^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,endAst:/\*\*(?!\*)/g,endUnd:/__(?!_)/g},em:{start:/^_|\*/,middle:/^()\*(?=\S)([\s\S]*?\S)\*(?!\*)|^_(?=\S)([\s\S]*?\S)_(?!_)/,endAst:/\*(?!\*)/g,endUnd:/_(?!_)/g},link:f(/^!?\[(label)\]\((.*?)\)/).replace("label",S._label).getRegex(),reflink:f(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",S._label).getRegex()}),S.gfm=B({},S.normal,{escape:f(S.escape).replace("])","~|])").getRegex(),_extended_email:/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/,url:/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,_backpedal:/(?:[^?!.,:;*_~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/}),S.gfm.url=f(S.gfm.url,"i").replace("email",S.gfm._extended_email).getRegex(),S.breaks=B({},S.gfm,{br:f(S.br).replace("{2,}","*").getRegex(),text:f(S.gfm.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()});var I=function(){function u(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||r.defaults,this.options.tokenizer=this.options.tokenizer||new z,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,(this.tokenizer.lexer=this).inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};e={block:$.normal,inline:S.normal};this.options.pedantic?(e.block=$.pedantic,e.inline=S.pedantic):this.options.gfm&&(e.block=$.gfm,this.options.breaks?e.inline=S.breaks:e.inline=S.gfm),this.tokenizer.rules=e}u.lex=function(e,t){return new u(t).lex(e)},u.lexInline=function(e,t){return new u(t).inlineTokens(e)};var e,t,n=u.prototype;return n.lex=function(e){var t;for(e=e.replace(/\r\n|\r/g,"\n").replace(/\t/g,"    "),this.blockTokens(e,this.tokens);t=this.inlineQueue.shift();)this.inlineTokens(t.src,t.tokens);return this.tokens},n.blockTokens=function(r,t){var u,e,i,n,s=this;for(void 0===t&&(t=[]),this.options.pedantic&&(r=r.replace(/^ +$/gm,""));r;)if(!(this.options.extensions&&this.options.extensions.block&&this.options.extensions.block.some(function(e){return!!(u=e.call({lexer:s},r,t))&&(r=r.substring(u.raw.length),t.push(u),!0)})))if(u=this.tokenizer.space(r))r=r.substring(u.raw.length),u.type&&t.push(u);else if(u=this.tokenizer.code(r))r=r.substring(u.raw.length),!(e=t[t.length-1])||"paragraph"!==e.type&&"text"!==e.type?t.push(u):(e.raw+="\n"+u.raw,e.text+="\n"+u.text,this.inlineQueue[this.inlineQueue.length-1].src=e.text);else if(u=this.tokenizer.fences(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.heading(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.hr(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.blockquote(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.list(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.html(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.def(r))r=r.substring(u.raw.length),!(e=t[t.length-1])||"paragraph"!==e.type&&"text"!==e.type?this.tokens.links[u.tag]||(this.tokens.links[u.tag]={href:u.href,title:u.title}):(e.raw+="\n"+u.raw,e.text+="\n"+u.raw,this.inlineQueue[this.inlineQueue.length-1].src=e.text);else if(u=this.tokenizer.table(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.lheading(r))r=r.substring(u.raw.length),t.push(u);else if(i=r,this.options.extensions&&this.options.extensions.startBlock&&function(){var t,u=1/0,n=r.slice(1);s.options.extensions.startBlock.forEach(function(e){"number"==typeof(t=e.call({lexer:this},n))&&0<=t&&(u=Math.min(u,t))}),u<1/0&&0<=u&&(i=r.substring(0,u+1))}(),this.state.top&&(u=this.tokenizer.paragraph(i)))e=t[t.length-1],n&&"paragraph"===e.type?(e.raw+="\n"+u.raw,e.text+="\n"+u.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=e.text):t.push(u),n=i.length!==r.length,r=r.substring(u.raw.length);else if(u=this.tokenizer.text(r))r=r.substring(u.raw.length),(e=t[t.length-1])&&"text"===e.type?(e.raw+="\n"+u.raw,e.text+="\n"+u.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=e.text):t.push(u);else if(r){var l="Infinite loop on byte: "+r.charCodeAt(0);if(this.options.silent){console.error(l);break}throw new Error(l)}return this.state.top=!0,t},n.inline=function(e,t){this.inlineQueue.push({src:e,tokens:t})},n.inlineTokens=function(r,t){var u,e,i,s=this;void 0===t&&(t=[]);var n,l,a,D=r;if(this.tokens.links){var o=Object.keys(this.tokens.links);if(0<o.length)for(;null!=(n=this.tokenizer.rules.inline.reflinkSearch.exec(D));)o.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(D=D.slice(0,n.index)+"["+y("a",n[0].length-2)+"]"+D.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;null!=(n=this.tokenizer.rules.inline.blockSkip.exec(D));)D=D.slice(0,n.index)+"["+y("a",n[0].length-2)+"]"+D.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);for(;null!=(n=this.tokenizer.rules.inline.escapedEmSt.exec(D));)D=D.slice(0,n.index)+"++"+D.slice(this.tokenizer.rules.inline.escapedEmSt.lastIndex);for(;r;)if(l||(a=""),l=!1,!(this.options.extensions&&this.options.extensions.inline&&this.options.extensions.inline.some(function(e){return!!(u=e.call({lexer:s},r,t))&&(r=r.substring(u.raw.length),t.push(u),!0)})))if(u=this.tokenizer.escape(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.tag(r))r=r.substring(u.raw.length),(e=t[t.length-1])&&"text"===u.type&&"text"===e.type?(e.raw+=u.raw,e.text+=u.text):t.push(u);else if(u=this.tokenizer.link(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.reflink(r,this.tokens.links))r=r.substring(u.raw.length),(e=t[t.length-1])&&"text"===u.type&&"text"===e.type?(e.raw+=u.raw,e.text+=u.text):t.push(u);else if(u=this.tokenizer.emStrong(r,D,a))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.codespan(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.br(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.del(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.autolink(r,R))r=r.substring(u.raw.length),t.push(u);else if(this.state.inLink||!(u=this.tokenizer.url(r,R))){if(i=r,this.options.extensions&&this.options.extensions.startInline&&function(){var t,u=1/0,n=r.slice(1);s.options.extensions.startInline.forEach(function(e){"number"==typeof(t=e.call({lexer:this},n))&&0<=t&&(u=Math.min(u,t))}),u<1/0&&0<=u&&(i=r.substring(0,u+1))}(),u=this.tokenizer.inlineText(i,T))r=r.substring(u.raw.length),"_"!==u.raw.slice(-1)&&(a=u.raw.slice(-1)),l=!0,(e=t[t.length-1])&&"text"===e.type?(e.raw+=u.raw,e.text+=u.text):t.push(u);else if(r){var c="Infinite loop on byte: "+r.charCodeAt(0);if(this.options.silent){console.error(c);break}throw new Error(c)}}else r=r.substring(u.raw.length),t.push(u);return t},e=u,t=[{key:"rules",get:function(){return{block:$,inline:S}}}],(n=null)&&i(e.prototype,n),t&&i(e,t),u}(),Z=function(){function e(e){this.options=e||r.defaults}var t=e.prototype;return t.code=function(e,t,u){var n=(t||"").match(/\S*/)[0];return!this.options.highlight||null!=(t=this.options.highlight(e,n))&&t!==e&&(u=!0,e=t),e=e.replace(/\n$/,"")+"\n",n?'<pre><code class="'+this.options.langPrefix+c(n,!0)+'">'+(u?e:c(e,!0))+"</code></pre>\n":"<pre><code>"+(u?e:c(e,!0))+"</code></pre>\n"},t.blockquote=function(e){return"<blockquote>\n"+e+"</blockquote>\n"},t.html=function(e){return e},t.heading=function(e,t,u,n){return this.options.headerIds?"<h"+t+' id="'+this.options.headerPrefix+n.slug(u)+'">'+e+"</h"+t+">\n":"<h"+t+">"+e+"</h"+t+">\n"},t.hr=function(){return this.options.xhtml?"<hr/>\n":"<hr>\n"},t.list=function(e,t,u){var n=t?"ol":"ul";return"<"+n+(t&&1!==u?' start="'+u+'"':"")+">\n"+e+"</"+n+">\n"},t.listitem=function(e){return"<li>"+e+"</li>\n"},t.checkbox=function(e){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox"'+(this.options.xhtml?" /":"")+"> "},t.paragraph=function(e){return"<p>"+e+"</p>\n"},t.table=function(e,t){return"<table>\n<thead>\n"+e+"</thead>\n"+(t=t&&"<tbody>"+t+"</tbody>")+"</table>\n"},t.tablerow=function(e){return"<tr>\n"+e+"</tr>\n"},t.tablecell=function(e,t){var u=t.header?"th":"td";return(t.align?"<"+u+' align="'+t.align+'">':"<"+u+">")+e+"</"+u+">\n"},t.strong=function(e){return"<strong>"+e+"</strong>"},t.em=function(e){return"<em>"+e+"</em>"},t.codespan=function(e){return"<code>"+e+"</code>"},t.br=function(){return this.options.xhtml?"<br/>":"<br>"},t.del=function(e){return"<del>"+e+"</del>"},t.link=function(e,t,u){if(null===(e=A(this.options.sanitize,this.options.baseUrl,e)))return u;e='<a href="'+c(e)+'"';return t&&(e+=' title="'+t+'"'),e+=">"+u+"</a>"},t.image=function(e,t,u){if(null===(e=A(this.options.sanitize,this.options.baseUrl,e)))return u;u='<img src="'+e+'" alt="'+u+'"';return t&&(u+=' title="'+t+'"'),u+=this.options.xhtml?"></img>":">"},t.text=function(e){return e},e}(),O=function(){function e(){}var t=e.prototype;return t.strong=function(e){return e},t.em=function(e){return e},t.codespan=function(e){return e},t.del=function(e){return e},t.html=function(e){return e},t.text=function(e){return e},t.link=function(e,t,u){return""+u},t.image=function(e,t,u){return""+u},t.br=function(){return""},e}(),q=function(){function e(){this.seen={}}var t=e.prototype;return t.serialize=function(e){return e.toLowerCase().trim().replace(/<[!\/a-z].*?>/gi,"").replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g,"").replace(/\s/g,"-")},t.getNextSafeSlug=function(e,t){var u=e,n=0;if(this.seen.hasOwnProperty(u))for(n=this.seen[e];u=e+"-"+ ++n,this.seen.hasOwnProperty(u););return t||(this.seen[e]=n,this.seen[u]=0),u},t.slug=function(e,t){void 0===t&&(t={});var u=this.serialize(e);return this.getNextSafeSlug(u,t.dryrun)},e}(),j=function(){function u(e){this.options=e||r.defaults,this.options.renderer=this.options.renderer||new Z,this.renderer=this.options.renderer,this.renderer.options=this.options,this.textRenderer=new O,this.slugger=new q}u.parse=function(e,t){return new u(t).parse(e)},u.parseInline=function(e,t){return new u(t).parseInline(e)};var e=u.prototype;return e.parse=function(e,t){void 0===t&&(t=!0);for(var u,n,r,i,s,l,a,D,o,c,h,p,f,F,g,A,C="",d=e.length,k=0;k<d;k++)if(D=e[k],!(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[D.type])||!1===(A=this.options.extensions.renderers[D.type].call({parser:this},D))&&["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(D.type))switch(D.type){case"space":continue;case"hr":C+=this.renderer.hr();continue;case"heading":C+=this.renderer.heading(this.parseInline(D.tokens),D.depth,x(this.parseInline(D.tokens,this.textRenderer)),this.slugger);continue;case"code":C+=this.renderer.code(D.text,D.lang,D.escaped);continue;case"table":for(l=o="",r=D.header.length,u=0;u<r;u++)l+=this.renderer.tablecell(this.parseInline(D.header[u].tokens),{header:!0,align:D.align[u]});for(o+=this.renderer.tablerow(l),a="",r=D.rows.length,u=0;u<r;u++){for(l="",i=(s=D.rows[u]).length,n=0;n<i;n++)l+=this.renderer.tablecell(this.parseInline(s[n].tokens),{header:!1,align:D.align[n]});a+=this.renderer.tablerow(l)}C+=this.renderer.table(o,a);continue;case"blockquote":a=this.parse(D.tokens),C+=this.renderer.blockquote(a);continue;case"list":for(o=D.ordered,E=D.start,c=D.loose,r=D.items.length,a="",u=0;u<r;u++)f=(p=D.items[u]).checked,F=p.task,h="",p.task&&(g=this.renderer.checkbox(f),c?0<p.tokens.length&&"paragraph"===p.tokens[0].type?(p.tokens[0].text=g+" "+p.tokens[0].text,p.tokens[0].tokens&&0<p.tokens[0].tokens.length&&"text"===p.tokens[0].tokens[0].type&&(p.tokens[0].tokens[0].text=g+" "+p.tokens[0].tokens[0].text)):p.tokens.unshift({type:"text",text:g}):h+=g),h+=this.parse(p.tokens,c),a+=this.renderer.listitem(h,F,f);C+=this.renderer.list(a,o,E);continue;case"html":C+=this.renderer.html(D.text);continue;case"paragraph":C+=this.renderer.paragraph(this.parseInline(D.tokens));continue;case"text":for(a=D.tokens?this.parseInline(D.tokens):D.text;k+1<d&&"text"===e[k+1].type;)a+="\n"+((D=e[++k]).tokens?this.parseInline(D.tokens):D.text);C+=t?this.renderer.paragraph(a):a;continue;default:var E='Token with "'+D.type+'" type was not found.';if(this.options.silent)return void console.error(E);throw new Error(E)}else C+=A||"";return C},e.parseInline=function(e,t){t=t||this.renderer;for(var u,n,r="",i=e.length,s=0;s<i;s++)if(u=e[s],!(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[u.type])||!1===(n=this.options.extensions.renderers[u.type].call({parser:this},u))&&["escape","html","link","image","strong","em","codespan","br","del","text"].includes(u.type))switch(u.type){case"escape":r+=t.text(u.text);break;case"html":r+=t.html(u.text);break;case"link":r+=t.link(u.href,u.title,this.parseInline(u.tokens,t));break;case"image":r+=t.image(u.href,u.title,u.text);break;case"strong":r+=t.strong(this.parseInline(u.tokens,t));break;case"em":r+=t.em(this.parseInline(u.tokens,t));break;case"codespan":r+=t.codespan(u.text);break;case"br":r+=t.br();break;case"del":r+=t.del(this.parseInline(u.tokens,t));break;case"text":r+=t.text(u.text);break;default:var l='Token with "'+u.type+'" type was not found.';if(this.options.silent)return void console.error(l);throw new Error(l)}else r+=n||"";return r},u}();function L(e,u,n){if(null==e)throw new Error("marked(): input parameter is undefined or null");if("string"!=typeof e)throw new Error("marked(): input parameter is of type "+Object.prototype.toString.call(e)+", string expected");if("function"==typeof u&&(n=u,u=null),v(u=B({},L.defaults,u||{})),n){var r,i=u.highlight;try{r=I.lex(e,u)}catch(e){return n(e)}var s=function(t){var e;if(!t)try{u.walkTokens&&L.walkTokens(r,u.walkTokens),e=j.parse(r,u)}catch(e){t=e}return u.highlight=i,t?n(t):n(null,e)};if(!i||i.length<3)return s();if(delete u.highlight,!r.length)return s();var l=0;return L.walkTokens(r,function(u){"code"===u.type&&(l++,setTimeout(function(){i(u.text,u.lang,function(e,t){return e?s(e):(null!=t&&t!==u.text&&(u.text=t,u.escaped=!0),void(0===--l&&s()))})},0))}),void(0===l&&s())}try{var t=I.lex(e,u);return u.walkTokens&&L.walkTokens(t,u.walkTokens),j.parse(t,u)}catch(e){if(e.message+="\nPlease report this to https://github.com/markedjs/marked.",u.silent)return"<p>An error occurred:</p><pre>"+c(e.message+"",!0)+"</pre>";throw e}}L.options=L.setOptions=function(e){return B(L.defaults,e),e=L.defaults,r.defaults=e,L},L.getDefaults=e,L.defaults=r.defaults,L.use=function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n,r=B.apply(void 0,[{}].concat(t)),s=L.defaults.extensions||{renderers:{},childTokens:{}};t.forEach(function(l){var t;l.extensions&&(n=!0,l.extensions.forEach(function(r){if(!r.name)throw new Error("extension name required");var i;if(r.renderer&&(i=s.renderers?s.renderers[r.name]:null,s.renderers[r.name]=i?function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n=r.renderer.apply(this,t);return n=!1===n?i.apply(this,t):n}:r.renderer),r.tokenizer){if(!r.level||"block"!==r.level&&"inline"!==r.level)throw new Error("extension level must be 'block' or 'inline'");s[r.level]?s[r.level].unshift(r.tokenizer):s[r.level]=[r.tokenizer],r.start&&("block"===r.level?s.startBlock?s.startBlock.push(r.start):s.startBlock=[r.start]:"inline"===r.level&&(s.startInline?s.startInline.push(r.start):s.startInline=[r.start]))}r.childTokens&&(s.childTokens[r.name]=r.childTokens)})),l.renderer&&function(){var e,s=L.defaults.renderer||new Z;for(e in l.renderer)!function(r){var i=s[r];s[r]=function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n=l.renderer[r].apply(s,t);return n=!1===n?i.apply(s,t):n}}(e);r.renderer=s}(),l.tokenizer&&function(){var e,s=L.defaults.tokenizer||new z;for(e in l.tokenizer)!function(r){var i=s[r];s[r]=function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n=l.tokenizer[r].apply(s,t);return n=!1===n?i.apply(s,t):n}}(e);r.tokenizer=s}(),l.walkTokens&&(t=L.defaults.walkTokens,r.walkTokens=function(e){l.walkTokens.call(this,e),t&&t.call(this,e)}),n&&(r.extensions=s),L.setOptions(r)})},L.walkTokens=function(e,l){for(var a,t=D(e);!(a=t()).done;)!function(){var t=a.value;switch(l.call(L,t),t.type){case"table":for(var e=D(t.header);!(u=e()).done;){var u=u.value;L.walkTokens(u.tokens,l)}for(var n,r=D(t.rows);!(n=r()).done;)for(var i=D(n.value);!(s=i()).done;){var s=s.value;L.walkTokens(s.tokens,l)}break;case"list":L.walkTokens(t.items,l);break;default:L.defaults.extensions&&L.defaults.extensions.childTokens&&L.defaults.extensions.childTokens[t.type]?L.defaults.extensions.childTokens[t.type].forEach(function(e){L.walkTokens(t[e],l)}):t.tokens&&L.walkTokens(t.tokens,l)}}()},L.parseInline=function(e,t){if(null==e)throw new Error("marked.parseInline(): input parameter is undefined or null");if("string"!=typeof e)throw new Error("marked.parseInline(): input parameter is of type "+Object.prototype.toString.call(e)+", string expected");v(t=B({},L.defaults,t||{}));try{var u=I.lexInline(e,t);return t.walkTokens&&L.walkTokens(u,t.walkTokens),j.parseInline(u,t)}catch(e){if(e.message+="\nPlease report this to https://github.com/markedjs/marked.",t.silent)return"<p>An error occurred:</p><pre>"+c(e.message+"",!0)+"</pre>";throw e}},L.Parser=j,L.parser=j.parse,L.Renderer=Z,L.TextRenderer=O,L.Lexer=I,L.lexer=I.lex,L.Tokenizer=z,L.Slugger=q;var P=(L.parse=L).options,Q=L.setOptions,U=L.use,M=L.walkTokens,N=L.parseInline,X=L,G=j.parse,m=I.lex;r.Lexer=I,r.Parser=j,r.Renderer=Z,r.Slugger=q,r.TextRenderer=O,r.Tokenizer=z,r.getDefaults=e,r.lexer=m,r.marked=L,r.options=P,r.parse=X,r.parseInline=N,r.parser=G,r.setOptions=Q,r.use=U,r.walkTokens=M,Object.defineProperty(r,"__esModule",{value:!0})});
const markedStyles = `@media (prefers-color-scheme:dark){.markdown-body{color-scheme:dark;--color-prettylights-syntax-comment:#929aa4;--color-prettylights-syntax-constant:#80c4ff;--color-prettylights-syntax-entity:#d7b1ff;--color-prettylights-syntax-storage-modifier-import:#ced5dd;--color-prettylights-syntax-entity-tag:#82eb8a;--color-prettylights-syntax-keyword:#ff817a;--color-prettylights-syntax-string:#abd9ff;--color-prettylights-syntax-variable:#ffac60;--color-prettylights-syntax-brackethighlighter-unmatched:#f95a52;--color-prettylights-syntax-invalid-illegal-text:#f3f8fd;--color-prettylights-syntax-invalid-illegal-bg:#941a1e;--color-prettylights-syntax-carriage-return-text:#f3f8fd;--color-prettylights-syntax-carriage-return-bg:#bb2829;--color-prettylights-syntax-string-regexp:#82eb8a;--color-prettylights-syntax-markup-list:#f5d06a;--color-prettylights-syntax-markup-heading:#2474f0;--color-prettylights-syntax-markup-italic:#ced5dd;--color-prettylights-syntax-markup-bold:#ced5dd;--color-prettylights-syntax-markup-deleted-text:#ffe0db;--color-prettylights-syntax-markup-deleted-bg:#6e0a12;--color-prettylights-syntax-markup-inserted-text:#b3f7b9;--color-prettylights-syntax-markup-inserted-bg:#063e1a;--color-prettylights-syntax-markup-changed-text:#ffe2bb;--color-prettylights-syntax-markup-changed-bg:#5f2305;--color-prettylights-syntax-markup-ignored-text:#ced5dd;--color-prettylights-syntax-markup-ignored-bg:#145ecc;--color-prettylights-syntax-meta-diff-range:#d7b1ff;--color-prettylights-syntax-brackethighlighter-angle:#929aa4;--color-prettylights-syntax-sublimelinter-gutter-mark:#4e555e;--color-prettylights-syntax-constant-other-reference-link:#abd9ff;--color-fg-default:#ced5dd;--color-fg-muted:#929aa4;--color-fg-subtle:#4e555e;--color-canvas-default:#1e1f1f;--color-canvas-subtle:#252727;--color-border-default:#353b42;--color-border-muted:#282d34;--color-neutral-muted:rgba(115,123,134,0.4);--color-accent-fg:#5eb0ff;--color-accent-emphasis:#2474f0;--color-attention-subtle:rgba(192,135,15,0.15);--color-danger-fg:#f95a52}}@media (prefers-color-scheme:light){.markdown-body{color-scheme:light;--color-prettylights-syntax-comment:#6e7781;--color-prettylights-syntax-constant:#0550ae;--color-prettylights-syntax-entity:#8250df;--color-prettylights-syntax-storage-modifier-import:#24292f;--color-prettylights-syntax-entity-tag:#116329;--color-prettylights-syntax-keyword:#cf222e;--color-prettylights-syntax-string:#0a3069;--color-prettylights-syntax-variable:#953800;--color-prettylights-syntax-brackethighlighter-unmatched:#82071e;--color-prettylights-syntax-invalid-illegal-text:#f6f8fa;--color-prettylights-syntax-invalid-illegal-bg:#82071e;--color-prettylights-syntax-carriage-return-text:#f6f8fa;--color-prettylights-syntax-carriage-return-bg:#cf222e;--color-prettylights-syntax-string-regexp:#116329;--color-prettylights-syntax-markup-list:#3b2300;--color-prettylights-syntax-markup-heading:#0550ae;--color-prettylights-syntax-markup-italic:#24292f;--color-prettylights-syntax-markup-bold:#24292f;--color-prettylights-syntax-markup-deleted-text:#82071e;--color-prettylights-syntax-markup-deleted-bg:#FFEBE9;--color-prettylights-syntax-markup-inserted-text:#116329;--color-prettylights-syntax-markup-inserted-bg:#dafbe1;--color-prettylights-syntax-markup-changed-text:#953800;--color-prettylights-syntax-markup-changed-bg:#ffd8b5;--color-prettylights-syntax-markup-ignored-text:#eaeef2;--color-prettylights-syntax-markup-ignored-bg:#0550ae;--color-prettylights-syntax-meta-diff-range:#8250df;--color-prettylights-syntax-brackethighlighter-angle:#57606a;--color-prettylights-syntax-sublimelinter-gutter-mark:#8c959f;--color-prettylights-syntax-constant-other-reference-link:#0a3069;--color-fg-default:#24292f;--color-fg-muted:#57606a;--color-fg-subtle:#6e7781;--color-canvas-default:#ffffff;--color-canvas-subtle:#f6f8fa;--color-border-default:#d0d7de;--color-border-muted:hsla(210,18%,87%,1);--color-neutral-muted:rgba(175,184,193,0.2);--color-accent-fg:#0969da;--color-accent-emphasis:#0969da;--color-attention-subtle:#fff8c5;--color-danger-fg:#cf222e}}.markdown-body{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;margin:0;color:var(--color-fg-default);background-color:var(--color-canvas-default);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:16px;line-height:1.5;word-wrap:break-word}.markdown-body h1:hover .anchor .octicon-link:before,.markdown-body h2:hover .anchor .octicon-link:before,.markdown-body h3:hover .anchor .octicon-link:before,.markdown-body h4:hover .anchor .octicon-link:before,.markdown-body h5:hover .anchor .octicon-link:before,.markdown-body h6:hover .anchor .octicon-link:before{width:16px;height:16px;content:' ';display:inline-block;background-color:currentColor;-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>");mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>")}.markdown-body [data-catalyst],.markdown-body details,.markdown-body figcaption,.markdown-body figure{display:block}.markdown-body summary{display:list-item}.markdown-body [hidden],.markdown-body details:not([open])>:not(summary){display:none!important}.markdown-body a{background-color:transparent;color:var(--color-accent-fg);text-decoration:none}.markdown-body a:active,.markdown-body a:hover{outline-width:0}.markdown-body abbr[title]{border-bottom:none;text-decoration:underline dotted}.markdown-body .pl-corl,.markdown-body a:hover{text-decoration:underline}.markdown-body b,.markdown-body strong,.markdown-body table th{font-weight:600}.markdown-body dfn{font-style:italic}.markdown-body h1{margin:.67em 0;padding-bottom:.3em;font-size:2em;border-bottom:1px solid var(--color-border-muted)}.markdown-body mark{background-color:var(--color-attention-subtle);color:var(--color-text-primary)}.markdown-body img,.markdown-body table tr{background-color:var(--color-canvas-default)}.markdown-body small{font-size:90%}.markdown-body sub,.markdown-body sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}.markdown-body sub{bottom:-.25em}.markdown-body sup{top:-.5em}.markdown-body img{border-style:none;max-width:100%;box-sizing:content-box}.markdown-body code,.markdown-body kbd,.markdown-body pre,.markdown-body samp{font-family:monospace,monospace;font-size:1em}.markdown-body figure{margin:1em 40px}.markdown-body hr{box-sizing:content-box;overflow:hidden;background:0 0;border-bottom:1px solid var(--color-border-muted);height:.25em;padding:0;margin:24px 0;background-color:var(--color-border-default);border:0}.markdown-body kbd,.markdown-body table tr:nth-child(2n){background-color:var(--color-canvas-subtle)}.markdown-body input{font:inherit;margin:0;overflow:visible;font-family:inherit;font-size:inherit;line-height:inherit}.markdown-body [type=button],.markdown-body [type=reset],.markdown-body [type=submit]{-webkit-appearance:button}.markdown-body [type=button]::-moz-focus-inner,.markdown-body [type=reset]::-moz-focus-inner,.markdown-body [type=submit]::-moz-focus-inner{border-style:none;padding:0}.markdown-body [type=button]:-moz-focusring,.markdown-body [type=reset]:-moz-focusring,.markdown-body [type=submit]:-moz-focusring{outline:ButtonText dotted 1px}.markdown-body [type=checkbox],.markdown-body [type=radio]{box-sizing:border-box;padding:0}.markdown-body [type=number]::-webkit-inner-spin-button,.markdown-body [type=number]::-webkit-outer-spin-button{height:auto}.markdown-body [type=search]{-webkit-appearance:textfield;outline-offset:-2px}.markdown-body [type=search]::-webkit-search-cancel-button,.markdown-body [type=search]::-webkit-search-decoration{-webkit-appearance:none}.markdown-body ::-webkit-input-placeholder{color:inherit;opacity:.54}.markdown-body ::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}.markdown-body hr::before,.markdown-body::before{display:table;content:""}.markdown-body hr::after,.markdown-body::after{display:table;clear:both;content:""}.markdown-body table{border-spacing:0;border-collapse:collapse;display:block;width:max-content;max-width:100%;overflow:auto}.markdown-body dl,.markdown-body td,.markdown-body th{padding:0}.markdown-body .task-list-item.enabled label,.markdown-body details summary{cursor:pointer}.markdown-body kbd{display:inline-block;padding:3px 5px;font:11px/10px ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace;color:var(--color-fg-default);vertical-align:middle;border:solid 1px var(--color-neutral-muted);border-bottom-color:var(--color-neutral-muted);border-radius:6px;box-shadow:inset 0 -1px 0 var(--color-neutral-muted)}.markdown-body code,.markdown-body pre,.markdown-body tt{font-family:ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace}.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6{margin-top:24px;margin-bottom:16px;font-weight:600;line-height:1.25}.markdown-body h2{font-weight:600;padding-bottom:.3em;font-size:1.5em;border-bottom:1px solid var(--color-border-muted)}.markdown-body h3{font-weight:600;font-size:1.25em}.markdown-body h4{font-weight:600;font-size:1em}.markdown-body h5{font-weight:600;font-size:.875em}.markdown-body h6{font-weight:600;font-size:.85em;color:var(--color-fg-muted)}.markdown-body blockquote{margin:0;padding:0 1em;color:var(--color-fg-muted);border-left:.25em solid var(--color-border-default)}.markdown-body ol,.markdown-body ul{padding-left:2em}.markdown-body ol ol,.markdown-body ol[type=i],.markdown-body ul ol{list-style-type:lower-roman}.markdown-body ol ol ol,.markdown-body ol ul ol,.markdown-body ol[type=a],.markdown-body ul ol ol,.markdown-body ul ul ol{list-style-type:lower-alpha}.markdown-body dd{margin-left:0}.markdown-body pre{word-wrap:normal}.markdown-body .octicon{fill:currentColor;display:inline-block;overflow:visible!important;vertical-align:text-bottom;fill:currentColor}.markdown-body ::placeholder{color:var(--color-fg-subtle);opacity:1}.markdown-body input::-webkit-inner-spin-button,.markdown-body input::-webkit-outer-spin-button{margin:0;-webkit-appearance:none;appearance:none}.markdown-body .pl-c{color:var(--color-prettylights-syntax-comment)}.markdown-body .pl-c1,.markdown-body .pl-s .pl-v{color:var(--color-prettylights-syntax-constant)}.markdown-body .pl-e,.markdown-body .pl-en{color:var(--color-prettylights-syntax-entity)}.markdown-body .pl-s .pl-s1,.markdown-body .pl-smi{color:var(--color-prettylights-syntax-storage-modifier-import)}.markdown-body .pl-ent{color:var(--color-prettylights-syntax-entity-tag)}.markdown-body .pl-k{color:var(--color-prettylights-syntax-keyword)}.markdown-body .pl-pds,.markdown-body .pl-s,.markdown-body .pl-s .pl-pse .pl-s1,.markdown-body .pl-sr,.markdown-body .pl-sr .pl-cce,.markdown-body .pl-sr .pl-sra,.markdown-body .pl-sr .pl-sre{color:var(--color-prettylights-syntax-string)}.markdown-body .pl-smw,.markdown-body .pl-v{color:var(--color-prettylights-syntax-variable)}.markdown-body .pl-bu{color:var(--color-prettylights-syntax-brackethighlighter-unmatched)}.markdown-body .pl-ii{color:var(--color-prettylights-syntax-invalid-illegal-text);background-color:var(--color-prettylights-syntax-invalid-illegal-bg)}.markdown-body .pl-c2{color:var(--color-prettylights-syntax-carriage-return-text);background-color:var(--color-prettylights-syntax-carriage-return-bg)}.markdown-body .pl-sr .pl-cce{font-weight:700;color:var(--color-prettylights-syntax-string-regexp)}.markdown-body .pl-ml{color:var(--color-prettylights-syntax-markup-list)}.markdown-body .pl-mh,.markdown-body .pl-mh .pl-en,.markdown-body .pl-ms{font-weight:700;color:var(--color-prettylights-syntax-markup-heading)}.markdown-body .pl-mi{font-style:italic;color:var(--color-prettylights-syntax-markup-italic)}.markdown-body .pl-mb{font-weight:700;color:var(--color-prettylights-syntax-markup-bold)}.markdown-body .pl-md{color:var(--color-prettylights-syntax-markup-deleted-text);background-color:var(--color-prettylights-syntax-markup-deleted-bg)}.markdown-body .pl-mi1{color:var(--color-prettylights-syntax-markup-inserted-text);background-color:var(--color-prettylights-syntax-markup-inserted-bg)}.markdown-body .pl-mc{color:var(--color-prettylights-syntax-markup-changed-text);background-color:var(--color-prettylights-syntax-markup-changed-bg)}.markdown-body .pl-mi2{color:var(--color-prettylights-syntax-markup-ignored-text);background-color:var(--color-prettylights-syntax-markup-ignored-bg)}.markdown-body .pl-mdr{font-weight:700;color:var(--color-prettylights-syntax-meta-diff-range)}.markdown-body .pl-ba{color:var(--color-prettylights-syntax-brackethighlighter-angle)}.markdown-body .pl-sg{color:var(--color-prettylights-syntax-sublimelinter-gutter-mark)}.markdown-body .pl-corl{color:var(--color-prettylights-syntax-constant-other-reference-link)}.markdown-body g-emoji{font-family:"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";font-size:1em;font-style:normal!important;font-weight:400;line-height:1;vertical-align:-.075em}.markdown-body g-emoji img{width:1em;height:1em}.markdown-body>:first-child{margin-top:0!important}.markdown-body>:last-child{margin-bottom:0!important}.markdown-body a:not([href]){color:inherit;text-decoration:none}.markdown-body .absent{color:var(--color-danger-fg)}.markdown-body .anchor{float:left;padding-right:4px;margin-left:-20px;line-height:1}.markdown-body .anchor:focus{outline:0}.markdown-body blockquote,.markdown-body details,.markdown-body dl,.markdown-body ol,.markdown-body p,.markdown-body pre,.markdown-body table,.markdown-body ul{margin-top:0;margin-bottom:16px}.markdown-body blockquote>:first-child{margin-top:0}.markdown-body blockquote>:last-child{margin-bottom:0}.markdown-body sup>a::before{content:"["}.markdown-body sup>a::after{content:"]"}.markdown-body h1 .octicon-link,.markdown-body h2 .octicon-link,.markdown-body h3 .octicon-link,.markdown-body h4 .octicon-link,.markdown-body h5 .octicon-link,.markdown-body h6 .octicon-link{color:var(--color-fg-default);vertical-align:middle;visibility:hidden}.markdown-body h1:hover .anchor,.markdown-body h2:hover .anchor,.markdown-body h3:hover .anchor,.markdown-body h4:hover .anchor,.markdown-body h5:hover .anchor,.markdown-body h6:hover .anchor{text-decoration:none}.markdown-body h1:hover .anchor .octicon-link,.markdown-body h2:hover .anchor .octicon-link,.markdown-body h3:hover .anchor .octicon-link,.markdown-body h4:hover .anchor .octicon-link,.markdown-body h5:hover .anchor .octicon-link,.markdown-body h6:hover .anchor .octicon-link{visibility:visible}.markdown-body h1 code,.markdown-body h1 tt,.markdown-body h2 code,.markdown-body h2 tt,.markdown-body h3 code,.markdown-body h3 tt,.markdown-body h4 code,.markdown-body h4 tt,.markdown-body h5 code,.markdown-body h5 tt,.markdown-body h6 code,.markdown-body h6 tt{padding:0 .2em;font-size:inherit}.markdown-body ol.no-list,.markdown-body ul.no-list{padding:0;list-style-type:none}.markdown-body div>ol:not([type]),.markdown-body ol[type="1"]{list-style-type:decimal}.markdown-body ol ol,.markdown-body ol ul,.markdown-body ul ol,.markdown-body ul ul{margin-top:0;margin-bottom:0}.markdown-body li>p{margin-top:16px}.markdown-body li+li{margin-top:.25em}.markdown-body dl dt{padding:0;margin-top:16px;font-size:1em;font-style:italic;font-weight:600}.markdown-body dl dd{padding:0 16px;margin-bottom:16px}.markdown-body table td,.markdown-body table th{padding:6px 13px;border:1px solid var(--color-border-default)}.markdown-body table tr{border-top:1px solid var(--color-border-muted)}.markdown-body .emoji,.markdown-body table img{background-color:transparent}.markdown-body img[align=right]{padding-left:20px}.markdown-body img[align=left]{padding-right:20px}.markdown-body .emoji{max-width:none;vertical-align:text-top}.markdown-body span.frame{display:block;overflow:hidden}.markdown-body span.frame>span{display:block;float:left;width:auto;padding:7px;margin:13px 0 0;overflow:hidden;border:1px solid var(--color-border-default)}.markdown-body span.frame span img{display:block;float:left}.markdown-body span.frame span span{display:block;padding:5px 0 0;clear:both;color:var(--color-fg-default)}.markdown-body span.align-center,.markdown-body span.align-right{display:block;overflow:hidden;clear:both}.markdown-body span.align-center>span{display:block;margin:13px auto 0;overflow:hidden;text-align:center}.markdown-body span.align-center span img{margin:0 auto;text-align:center}.markdown-body span.align-right>span{display:block;margin:13px 0 0;overflow:hidden;text-align:right}.markdown-body span.align-right span img{margin:0;text-align:right}.markdown-body span.float-left{display:block;float:left;margin-right:13px;overflow:hidden}.markdown-body span.float-left span{margin:13px 0 0}.markdown-body span.float-right{display:block;float:right;margin-left:13px;overflow:hidden}.markdown-body span.float-right>span{display:block;margin:13px auto 0;overflow:hidden;text-align:right}.markdown-body code,.markdown-body tt{padding:.2em .4em;margin:0;font-size:85%;background-color:var(--color-neutral-muted);border-radius:6px}.markdown-body .task-list-item .handle,.markdown-body code br,.markdown-body tt br{display:none}.markdown-body del code{text-decoration:inherit}.markdown-body pre code{font-size:100%}.markdown-body pre>code{padding:0;margin:0;word-break:normal;white-space:pre;background:0 0;border:0}.markdown-body .highlight{margin-bottom:16px}.markdown-body .highlight pre{margin-bottom:0;word-break:normal}.markdown-body .highlight pre,.markdown-body pre{padding:16px;overflow:auto;font-size:85%;line-height:1.45;background-color:var(--color-canvas-subtle);border-radius:6px}.markdown-body pre code,.markdown-body pre tt{display:inline;max-width:auto;padding:0;margin:0;overflow:visible;line-height:inherit;word-wrap:normal;background-color:transparent;border:0}.markdown-body .csv-data td,.markdown-body .csv-data th{padding:5px;overflow:hidden;font-size:12px;line-height:1;text-align:left;white-space:nowrap}.markdown-body .csv-data .blob-num{padding:10px 8px 9px;text-align:right;background:var(--color-canvas-default);border:0}.markdown-body .csv-data tr{border-top:0}.markdown-body .csv-data th{font-weight:600;background:var(--color-canvas-subtle);border-top:0}.markdown-body .footnotes{font-size:12px;color:var(--color-fg-muted);border-top:1px solid var(--color-border-default)}.markdown-body .footnotes ol{padding-left:16px}.markdown-body .footnotes li{position:relative}.markdown-body .footnotes li:target::before{position:absolute;top:-8px;right:-8px;bottom:-8px;left:-24px;pointer-events:none;content:"";border:2px solid var(--color-accent-emphasis);border-radius:6px}.markdown-body .footnotes li:target{color:var(--color-fg-default)}.markdown-body .footnotes .data-footnote-backref g-emoji{font-family:monospace}.markdown-body .task-list-item{list-style-type:none}.markdown-body .task-list-item label{font-weight:400}.markdown-body .task-list-item+.task-list-item{margin-top:3px}.markdown-body .task-list-item-checkbox{margin:0 .2em .25em -1.6em;vertical-align:middle}.markdown-body .contains-task-list:dir(rtl) .task-list-item-checkbox{margin:0 -1.6em .25em .2em}.markdown-body ::-webkit-calendar-picker-indicator{filter:invert(50%)}`
