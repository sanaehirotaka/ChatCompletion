/**
 * markedライブラリの設定を行います。
 * - `breaks`: 改行を`<br>`タグに変換します。
 * - `gfm`: GitHub Flavored Markdownを有効にします。
 */
marked.use({
    breaks: true,
    gfm: true
});

class FileDialog {
    /**
     * @param {FileDialogOptions} options 
     */
    constructor(options) {
        this.options = options;
    }
    /**
     * @returns {Promise<File[]>}
     */
    async open() {
        return new Promise((resolve, reject) => {
            const input = document.createElement("input");
            input.setAttribute("type", "file");
            if (this.options.accept) {
                input.setAttribute("accept", this.options.accept);
            }
            input.setAttribute("hidden", "");
            input.addEventListener("change", event => {
                if (this.options.filter) {
                    resolve([...event.target.files].filter(this.options.filter));
                } else {
                    resolve([...event.target.files]);
                }
            });
            document.body.append(input);
            input.click();
            setTimeout(() => input.remove());
        });
    }
}
class FileDialogOptions {
    accept = "";
    filter;
}

/**
 * チャットUIを管理するクラスです。
 * チャットの表示、メッセージの追加、補完機能などを提供します。
 */
class ChatUI {
    /** @type {Element} */
    root;

    static imageContentToImage(mimeType, data) {
        const img = document.createElement("img");
        img.src = `data:${mimeType};base64,${data}`;
        return img;
    }

    /**
     * 画像を指定された最大サイズにリサイズします。
     * @param {ImageContent} imageContent - リサイズするImageContentオブジェクト。
     * @param {number} maxWidth - 最大幅。
     * @param {number} maxHeight - 最大高さ。
     * @returns {Promise<ImageContent>} リサイズされたImageContentオブジェクト。
     */
    static async resizeImage(imageContent, maxWidth, maxHeight) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const aspectRatio = width / height;
                    if (width > height) {
                        width = maxWidth;
                        height = width / aspectRatio;
                    } else {
                        height = maxHeight;
                        width = height * aspectRatio;
                    }

                    if (width > maxWidth) {
                        width = maxWidth;
                        height = width / aspectRatio;
                    }

                    if (height > maxHeight) {
                        height = maxHeight;
                        width = height * aspectRatio;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve(ImageContent.fromDataURL(reader.result, imageContent.mimeType));
                    };
                    reader.readAsDataURL(blob);
                }, imageContent.mimeType);
            };
            img.src = `data:${imageContent.mimeType};base64,${imageContent.data}`;
        });
    }

    /**
     * ChatUIの新しいインスタンスを作成します。
     * @param {string} endpointUrl - チャットAPIのエンドポイントURL。
     * @param {Element} rootElement - チャットUIをレンダリングするDOM要素。
     */
    constructor(endpointUrl, rootElement) {
        this.chatManager = new ChatManager(endpointUrl);
        this.root = rootElement;
    }

    /**
     * 補完処理中のプログレスインジケータを表示します。
     * @param {number|undefined} index - 補完対象のメッセージのインデックス。指定しない場合は末尾に追加されます。
     */
    #completingStart(index = undefined) {
        const progress = document.createElement("div");
        progress.classList.add("completing");

        if (index === undefined) {
            this.root.append(progress);
        } else {
            this.root.querySelectorAll(".message")[index].querySelector(".items").append(progress);
        }
        progress.append("応答を待っています...");
        const start = Date.now();
        return [progress, setInterval(() => {
            progress.replaceChildren(`応答を待っています...${((Date.now() - start) / 1000).toFixed(1)}s`);
        }, 100)];
    }

    #completingEnd(element, timerId) {
        clearInterval(timerId);
        element.remove();
    }

    /**
     * チャットの補完処理を実行します。
     * 新しいメッセージの補完、または既存メッセージの再生成を行います。
     * @param {number|undefined} index - 再生成するメッセージのインデックス。指定しない場合は新しい補完を行います。
     */
    async completion(index = undefined) {
        const [progress, timerId] = this.#completingStart(index);
        this.chatManager.modelName = document.querySelector("#modelName").value;
        try {
            if (index === undefined) {
                const contents = await this.chatManager.completion();
                if (Array.isArray(contents) && contents.length > 0) {
                    this.chatManager.history.append(contents[0]);
                    const element = this.#createMessageElement(contents[0]);
                    this.root.append(element);
                    element.querySelector("[tabindex]").focus();
                }
            } else {
                const contents = await this.chatManager.clone(0, index).completion();
                if (Array.isArray(contents) && contents.length > 0) {
                    this.chatManager.history.histories[index] = contents[0];
                    const itemsDiv = this.root.querySelectorAll(".message")[index].querySelector(".items");
                    this.#replaceItemsElement(contents[0], itemsDiv);
                    itemsDiv.querySelector("[tabindex]").focus();
                }
            }
        } catch (error) {
            console.error("Completion error:", error);
            const errorMessage = document.createElement("div");
            errorMessage.classList.add("error-message");
            errorMessage.textContent = `エラーが発生しました: ${error.message}`;
            this.root.append(errorMessage);
        } finally {
            this.#completingEnd(progress, timerId);
        }
    }

    /**
     * 指定されたロールと内容でメッセージをチャットUIに追加します。
     * @param {string} role - メッセージのロール（例: "user", "assistant"）。
     * @param {boolean} visibility
     * @param {...*} message - メッセージの内容。
     */
    appendMessage(role, visibility, ...message) {
        const contents = this.chatManager.history.append(new ChatMessageContent(role, ...message));
        for (const content of contents) {
            const element = this.#createMessageElement(content, visibility);
            this.root.append(element);
            element.querySelector("[tabindex]")?.focus();
        }
    }

    /**
     * ChatMessageContentオブジェクトからメッセージのDOM要素を作成します。
     * @param {ChatMessageContent} content - メッセージの内容を含むオブジェクト。
     * @returns {HTMLDivElement} 作成されたメッセージのDOM要素。
     */
    #createMessageElement(content, visibility = true) {
        const messageDiv = document.createElement("div");
        if (!visibility) {
            messageDiv.setAttribute("hidden", "");
        }
        messageDiv.classList.add("message", `role-${content.role}`);
        const itemsDiv = document.createElement("div");
        itemsDiv.classList.add("items");
        this.#replaceItemsElement(content, itemsDiv);
        messageDiv.append(itemsDiv);
        return messageDiv;
    }

    /**
     * メッセージの内容に基づいて、指定された要素の子要素を置き換えます。
     * @param {ChatMessageContent} content - メッセージの内容を含むオブジェクト。
     * @param {Element} element - 子要素を置き換える対象のDOM要素。
     */
    #replaceItemsElement(content, element) {
        element.replaceChildren(...content.items.map((item, itemIndex) => {
            const itemDiv = document.createElement("div");
            itemDiv.classList.add("item", item.$type.toLowerCase());
            itemDiv.setAttribute("tabindex", "0");
            itemDiv.setAttribute("data-content-index", itemIndex);

            const innerDiv = document.createElement("div");
            innerDiv.classList.add("inner");
            if (item instanceof TextContent) {
                innerDiv.innerHTML = marked.parse(item.text);
            } else if (item instanceof ImageContent) {
                const img = ChatUI.imageContentToImage(item.mimeType, item.data);
                innerDiv.append(img);
            } else {
                throw new Error("Unknown content type");
            }
            itemDiv.append(innerDiv);

            const actionDiv = document.createElement("div");
            actionDiv.classList.add("action");
            if (item instanceof TextContent) {
                // 編集ボタン
                const editBtn = document.createElement("button");
                editBtn.classList.add("action-button", "edit-button");
                editBtn.append("✏️");
                editBtn.addEventListener("click", this.#handleEditAction.bind(this));
                actionDiv.append(editBtn);
                // 編集完了ボタン
                const editDoneBtn = document.createElement("button");
                editDoneBtn.classList.add("action-button", "edit-done-button");
                editDoneBtn.setAttribute("hidden", "");
                editDoneBtn.append("✅");
                editDoneBtn.addEventListener("click", this.#handleEditDoneAction.bind(this));
                actionDiv.append(editDoneBtn);
                // 削除ボタン
                const deleteBtn = document.createElement("button");
                deleteBtn.classList.add("action-button", "delete-button");
                deleteBtn.append("🗑️");
                deleteBtn.addEventListener("click", this.#handleDeleteAction.bind(this));
                actionDiv.append(deleteBtn);

                if (content.role == "assistant") {
                    // 再生成ボタン
                    const regenerateBtn = document.createElement("button");
                    regenerateBtn.classList.add("action-button", "regenerate-button");
                    regenerateBtn.append("🔄");
                    regenerateBtn.addEventListener("click", this.#handleRegenerateAction.bind(this));
                    actionDiv.append(regenerateBtn);
                }
            } else if (item instanceof ImageContent) {
                // 編集ボタン
                const editBtn = document.createElement("button");
                editBtn.classList.add("action-button", "edit-button");
                editBtn.append("✏️");
                editBtn.addEventListener("click", this.#handleEditAction.bind(this));
                actionDiv.append(editBtn);
                // 削除ボタン
                const deleteBtn = document.createElement("button");
                deleteBtn.classList.add("action-button", "delete-button");
                deleteBtn.append("🗑️");
                deleteBtn.addEventListener("click", this.#handleDeleteAction.bind(this));
                actionDiv.append(deleteBtn);
            } else {
                throw new Error("Unknown content type");
            }
            itemDiv.append(actionDiv);
            return itemDiv;
        }));
    }

    /**
     * 編集ボタンがクリックされたときのハンドラです。
     * メッセージの内容を編集可能にし、編集完了ボタンを表示します。
     * @param {PointerEvent} event - クリックイベントオブジェクト。
     */
    async #handleEditAction(event) {
        /** @type {Element} */
        const target = event.target;

        const content = this.chatManager.history
            .histories[this.#getMessageIndex(target)]
            .items[this.#getContentIndex(target)];

        if (content instanceof TextContent) {
            target.closest(".item").querySelector(".edit-done-button").removeAttribute("hidden");
            target.closest(".item").querySelector(".edit-button").setAttribute("hidden", "");
            const inner = target.closest(".item").querySelector(".inner");
            inner.setAttribute("contenteditable", "plaintext-only");
            inner.classList.add("form-control");
            inner.textContent = content.text;
            inner.focus();
        }
        if (content instanceof ImageContent) {
            const files = await new FileDialog({ accept: "image/*", filter: file => file.type.startsWith("image/") }).open();
            const file = files[0];
            if (!file) {
                return;
            }
            const [dataURL, mimeType] = await (new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    resolve([e.target.result, file.type]);
                };
                reader.readAsDataURL(file);
            }));
            const inner = target.closest(".item").querySelector(".inner");
            const originalImageContent = ImageContent.fromDataURL(dataURL);
            const resizedImageContent = await ChatUI.resizeImage(originalImageContent, 1024, 768);
            const img = ChatUI.imageContentToImage(resizedImageContent.mimeType, resizedImageContent.data);
            inner.replaceChildren(img);

            this.chatManager.history
                .histories[this.#getMessageIndex(target)]
                .items[this.#getContentIndex(target)] = resizedImageContent;
        }
    }

    /**
     * 編集完了ボタンがクリックされたときのハンドラです。
     * 編集された内容を保存し、メッセージを非編集可能に戻します。
     * @param {PointerEvent} event - クリックイベントオブジェクト。
     */
    #handleEditDoneAction(event) {
        /** @type {Element} */
        const target = event.target;
        target.closest(".item").querySelector(".edit-done-button").setAttribute("hidden", "");
        target.closest(".item").querySelector(".edit-button").removeAttribute("hidden");

        const inner = target.closest(".item").querySelector(".inner");
        const text = inner.textContent;

        this.chatManager.history
            .histories[this.#getMessageIndex(target)]
            .items[this.#getContentIndex(target)] = new TextContent(text);

        inner.innerHTML = marked.parse(text);

        inner.removeAttribute("contenteditable");
        inner.classList.remove("form-control");
    }

    /**
     * 削除ボタンがクリックされたときのハンドラです。
     * 該当するメッセージを削除します。
     * @param {PointerEvent} event - クリックイベントオブジェクト。
     */
    #handleDeleteAction(event) {
        /** @type {Element} */
        const target = event.target;
        const messageIndex = this.#getMessageIndex(target);
        const contentIndex = this.#getContentIndex(target);

        const contents = this.chatManager.history.histories[messageIndex];

        contents.items.splice(contentIndex, 1);
        if (contents.items.length == 0) {
            this.chatManager.history.histories.splice(messageIndex, 1);
            target.closest(".message").remove();
        } else {
            target.closest(".item").remove();
        }
    }

    /**
     * 再生成ボタンがクリックされたときのハンドラです。
     * 該当するメッセージの補完を再実行します。
     * @param {PointerEvent} event - クリックイベントオブジェクト。
     */
    #handleRegenerateAction(event) {
        /** @type {Element} */
        const target = event.target;
        this.completion(this.#getMessageIndex(target));
    }

    /**
     * 指定された要素からメッセージのインデックスを取得します。
     * @param {Element} element - 検索を開始するDOM要素。
     * @returns {number} メッセージのインデックス。
     */
    #getMessageIndex(element) {
        return [...this.root.querySelectorAll(".message")].indexOf(element.closest(".message"));
    }

    /**
     * 指定された要素からコンテンツアイテムのインデックスを取得します。
     * @param {Element} element - 検索を開始するDOM要素。
     * @returns {number} コンテンツアイテムのインデックス。
     */
    #getContentIndex(element) {
        return parseInt(element.closest(".item").dataset.contentIndex);
    }
}

/**
 * アプリケーションのエントリポイントです。
 * ChatUIの初期化とイベントリスナーの設定を行います。
 */
const chat = new ChatUI(`${schema}${APP_NAME}api-${P1 ^ P2}301879.${LOCATION}.run.app/api/chat`, document.getElementById("chat"));

const sendButton = document.getElementById("button-send");
const messageInput = document.querySelector("textarea");
const systemPromptMode = document.querySelector("#systemPromptMode");
const suspendMode = document.querySelector("#suspendMode");

sendButton.addEventListener("click", async () => {
    const message = messageInput.value;

    if (message.trim() !== "") {
        const role = systemPromptMode.checked ? "system" : "user";
        chat.appendMessage(role, true, message, ...document.querySelectorAll("#stagingmedias img"));
    }
    messageInput.value = "";
    document.querySelector("#stagingmedias").replaceChildren();

    setSendButtonText();

    if (!suspendMode.checked) {
        sendButton.setAttribute("disabled", "");
        await chat.completion();
        sendButton.removeAttribute("disabled", "");
        setSendButtonText();
    }
});

systemPromptMode.addEventListener("input", () => {
    suspendMode.checked = systemPromptMode.checked;
    setSendButtonText();
});
suspendMode.addEventListener("input", () => {
    if (!suspendMode.checked) {
        systemPromptMode.checked = false;
    }
    setSendButtonText();
});

function getPendingMessage() {
    const lastAssistant = chat.chatManager.history.histories.findLastIndex(m => m.role == "assistant");
    return chat.chatManager.history.histories.slice(lastAssistant + 1);
}

function setSendButtonText() {
    const sendBtnText = suspendMode.checked ? "追加" : "送信";
    const pendings = getPendingMessage().filter(m => m.role == "user").length;
    sendButton.replaceChildren(sendBtnText + (pendings > 0 ? `(${pendings})` : ""));
}

/**
 * ステージングエリアに画像を表示します。
 * @param {string} dataUrl - 画像のData URL。
 * @param {string} dataUrl - 画像のData URL。
 * @param {string} mimeType - 画像のMIMEタイプ。
 */
async function displayStagingMedia(dataUrl, mimeType) {
    const originalImageContent = ImageContent.fromDataURL(dataUrl);
    const resizedImageContent = await ChatUI.resizeImage(originalImageContent, 1024, 768);

    const imgContainer = document.createElement("div");
    imgContainer.classList.add("staging-media-item");

    const img = ChatUI.imageContentToImage(resizedImageContent.mimeType, resizedImageContent.data);

    const removeButton = document.createElement("button");
    removeButton.classList.add("btn", "btn-sm", "btn-danger", "remove-staging-media");
    removeButton.innerHTML = "&times;";
    removeButton.addEventListener("click", () => {
        imgContainer.remove();
    });

    imgContainer.append(img, removeButton);
    document.getElementById("stagingmedias").append(imgContainer);
}

const dropArea = document.getElementById("footer-drop-area");
dropArea.addEventListener("dragover", event => {
    if (!event.dataTransfer.types.includes("Files")) {
        return;
    }
    event.preventDefault();
    dropArea.classList.add("drag-over");
});
dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("drag-over");
});
dropArea.addEventListener("drop", event => {
    if (!event.dataTransfer.types.includes("Files")) {
        return;
    }
    event.preventDefault();
    dropArea.classList.remove("drag-over");
    [...event.dataTransfer.files].filter(file => file.type.startsWith("image/")).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            displayStagingMedia(e.target.result, file.type);
        };
        reader.readAsDataURL(file);
    });
});

document.getElementById("upload-image-button").addEventListener("click", async () => {
    const files = await new FileDialog({ accept: "image/*", filter: file => file.type.startsWith("image/") }).open();
    if (Array.isArray(files)) {
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                displayStagingMedia(e.target.result, file.type);
            };
            reader.readAsDataURL(file);
        });
    }
});

document.querySelector("#saveState").addEventListener("click", () => {
    const stateContent = chat.chatManager.history.histories.map(content => {
        const items = content.items.map(item => {
            if (item instanceof TextContent) {
                return "`" + item.text.replaceAll("`", "\\`") + "`";
            }
            else if (item instanceof ImageContent) {
                return `ChatUI.imageContentToImage("${item.mimeType}", "${item.data}")`;
            }
        });
        return `chat.appendMessage("${content.role}", true, ${items.join(", ")});`
    });
    const blob = new Blob([stateContent.join("\n")], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `state.${Date.now()}.js`; // ダウンロード時のファイル名
    
    document.body.appendChild(a); // DOMに追加しないとFirefoxなどで動作しない場合がある
    a.click(); // クリックイベントを発生させる
    document.body.removeChild(a); // 要素を削除
    
    URL.revokeObjectURL(url); // URLを解放してメモリをクリーンアップ
});

document.querySelector("#loadState").addEventListener("click", async () => {
    const files = await new FileDialog({
        accept: "text/*"
    }).open();
    files.forEach(async file => {
        const scriptDataURL = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            reader.readAsDataURL(file);
        });
        const script = document.createElement("script");
        script.setAttribute("src", scriptDataURL);
        document.body.append(script);
    });
    chat.chatManager.history.histories = [];
    chat.root.replaceChildren();
});

window.addEventListener("hashchange", event => {
    if (!location.hash.startsWith("#text:")) {
        return;
    }
    const text = decodeURI(location.hash.substring("#text:".length));
    messageInput.value += text
    messageInput.focus();
});

if (location.hash.startsWith("#load:")) {
    const script = document.createElement("script");
    const src = location.hash.substring("#load:".length);
    if (/^[a-z]+$/.test(src)) {
        script.setAttribute("src", `./${src}.js`);
        document.body.append(script);
    }
}
