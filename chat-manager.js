
/**
 * チャット管理クラス。
 * チャット履歴と補完リクエストの送信を扱います。
 */
class ChatManager {
    /** 認証認可 */
    static auth = new Auth();
    /** @type {ChatHistory} チャット履歴を管理するインスタンス。 */
    history = new ChatHistory();
    /** @type {string} 補完リクエストを送信するエンドポイントのURL。 */
    endpointUrl;
    /** @type {string} 利用するモデル名 */
    modelName;

    /**
     * ChatManager の新しいインスタンスを作成します。
     * @param {string} endpointUrl - 補完リクエストを送信するエンドポイントのURL。
     */
    constructor(endpointUrl) {
        this.endpointUrl = endpointUrl;
    }

    /**
     * チャット履歴の最後のメッセージがユーザーからのものである場合、
     * 指定されたエンドポイントに補完リクエストを送信し、
     * レスポンスを KernelContent の配列に変換して返します。
     * @returns {Promise<ChatMessageContent[]>} 補完結果の KernelContent の配列
     */
    async completion() {
        if (this.history.last()?.role !== "user") {
            return [];
        }
        const req = {
            modelName: this.modelName,
            history: this.history.histories
        };
        const response = await ChatManager.auth.request(new Request(this.endpointUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Encoding": "gzip"
            },
            body: await this.#compress(JSON.stringify(req)),
        }));
        const res = await response.json();
        return res.map(ChatMessageContent.fromObject);
    }

    async #compress(text) {
        const textEncoderStream = new TextEncoderStream();
        const compressionStream = new CompressionStream('gzip');
        const readableStream = textEncoderStream.readable.pipeThrough(compressionStream);
        const writer = textEncoderStream.writable.getWriter();
        writer.write(text);
        writer.close();
        const response = new Response(readableStream);
        const compressedBuffer = await response.arrayBuffer();
        return new Uint8Array(compressedBuffer);
    }

    /**
     * 現在の ChatManager インスタンスをクローンします。
     * 履歴は指定された範囲でスライスされます。
     * @param {number} [start] - 履歴の開始インデックス。
     * @param {number} [end] - 履歴の終了インデックス (排他的)。
     * @returns {ChatManager} 新しい ChatManager インスタンス。
     */
    clone(start, end) {
        const newInstance = new ChatManager(this.endpointUrl);
        newInstance.history = this.history.clone(start, end);
        return newInstance;
    }
}

/**
 * チャットメッセージのコンテンツを表すクラス。
 */
class ChatMessageContent {

    #role;

    /**
     * ChatMessageContent の新しいインスタンスを作成します。
     * @param {string} roleLabel - メッセージのロールラベル（例: "user", "assistant"）。
     * @param {...KernelContent} items - メッセージのコンテンツアイテム。
     */
    constructor(roleLabel, ...items) {
        this.#role = { label: roleLabel };
        this.items = this.#convert(...items);
    }

    get role() {
        return this.#role.label;
    }

    /**
     * メッセージにコンテンツアイテムを追加します。
     * @param {...KernelContent} items - 追加するコンテンツアイテム。
     */
    append(...items) {
        const added = this.#convert(...items);
        this.items = [...this.items, ...added];
        return added;
    }

    /**
     * メッセージ内のテキストコンテンツを返します。
     * 複数のテキストコンテンツがある場合は最初に見つかったものを返します。
     * @returns {string|undefined} テキストコンテンツの文字列、または見つからない場合は undefined。
     */
    text() {
        return this.items.find(content => content.$type == "TextContent")?.text;
    }

    /**
     * オブジェクトをJSON形式に変換します。
     * @returns {object} ロールとアイテムを含むJSONオブジェクト。
     */
    toJSON() {
        return {
            role: this.#role,
            items: this.items
        }
    }

    #convert(...items) {
        return items.map(item => {
            if (item instanceof KernelContent) {
                return item;
            }
            else if (typeof item == "string") {
                return new TextContent(item);
            }
            else if (item instanceof Image) {
                return ImageContent.fromDataURL(item.src);
            }
            else {
                throw new Error("KernelContent のインスタンスまたは文字列のみが許可されます。");
            }
        });
    }

    /**
     * オブジェクトから ChatMessageContent の新しいインスタンスを作成します。
     * @param {object} obj - 変換するオブジェクト。
     * @param {object} obj.role - ロール情報を含むオブジェクト。
     * @param {string} obj.role.label - メッセージのロールラベル。
     * @param {Array<object>} obj.items - コンテンツアイテムの配列。
     * @returns {ChatMessageContent} ChatMessageContent の新しいインスタンス。
     */
    static fromObject(obj) {
        return new ChatMessageContent(obj.role.label, ...obj.items.map(KernelContent.fromObject).filter(Boolean));
    }
}

/**
 * カーネルコンテンツの基底クラス。
 */
class KernelContent {

    $type = undefined;

    /**
     * オブジェクトから KernelContent の新しいインスタンスを作成します。
     * @param {object} obj - 変換するオブジェクト。
     * @param {string} obj.$type - コンテンツのタイプ（例: "TextContent", "ImageContent"）。
     * @returns {KernelContent|undefined} KernelContent の新しいインスタンス、または undefined。
     */
    static fromObject(obj) {
        switch (obj.$type) {
            case "TextContent":
                return TextContent.fromObject(obj);
            case "ImageContent":
                return ImageContent.fromObject(obj);
            default:
                return undefined;
        }
    }
}

/**
 * テキストコンテンツを表すクラス。
 * @extends KernelContent
 */
class TextContent extends KernelContent {
    /**
     * TextContent の新しいインスタンスを作成します。
     * @param {string} text - テキストコンテンツの文字列。
     */
    constructor(text) {
        super();
        this.$type = "TextContent";
        this.text = text;
        Object.freeze(this);
    }

    /**
     * テキストからTextContentの新しいインスタンスを作成します。
     * @param {string} text - テキストコンテンツの文字列。
     * @returns {TextContent} TextContentの新しいインスタンス。
     */
    static fromText(text) {
        return new TextContent(text);
    }

    /**
     * オブジェクトから TextContent の新しいインスタンスを作成します。
     * @param {object} obj - 変換するオブジェクト。
     * @param {string} obj.text - テキストコンテンツの文字列。
     * @returns {TextContent} TextContent の新しいインスタンス。
     */
    static fromObject(obj) {
        return new TextContent(obj.text);
    }
}

/**
 * 画像コンテンツを表すクラス。
 * @extends KernelContent
 */
class ImageContent extends KernelContent {
    /**
     * ImageContent の新しいインスタンスを作成します。
     * @param {string} mimeType - 画像のMIMEタイプ（例: "image/png", "image/jpeg"）。
     * @param {string} data - 画像のBase64エンコードされたデータ。
     */
    constructor(mimeType, data) {
        super();
        this.$type = "ImageContent";
        this.mimeType = mimeType;
        this.data = data;
        Object.freeze(this);
    }

    /**
     * DataURLからImageContentの新しいインスタンスを作成します。
     * @param {string} dataURL - DataURL。
     * @returns {ImageContent} ImageContentの新しいインスタンス。
     * @throws {Error} ファイルの読み込みに失敗した場合、または無効なファイルが指定された場合。
     */
    static fromDataURL(dataURL) {
        const { mimetype, base64string } = ChatManagerHelper.extractDataURLInfo(dataURL);
        return new ImageContent(mimetype, base64string);
    }

    /**
     * ファイルからImageContentの新しいインスタンスを作成します。
     * @param {File} file - 画像ファイルオブジェクト。
     * @returns {Promise<ImageContent>} ImageContentの新しいインスタンス。
     * @throws {Error} ファイルの読み込みに失敗した場合、または無効なファイルが指定された場合。
     */
    static async fromFile(file) {
        const { mimetype, base64string } = ChatManagerHelper.extractDataURLInfo(await ChatManagerHelper.fileToDataURL(file));
        return new ImageContent(mimetype, base64string);
    }

    /**
     * オブジェクトから ImageContent の新しいインスタンスを作成します。
     * @param {object} obj - 変換するオブジェクト。
     * @param {string} obj.mimeType - 画像のMIMEタイプ。
     * @param {string} obj.data - 画像のBase64エンコードされたデータ。
     * @returns {ImageContent} ImageContent の新しいインスタンス。
     */
    static fromObject(obj) {
        return new ImageContent(obj.mimeType, obj.data);
    }
}

/**
 * チャット履歴を管理するクラス。
 */
class ChatHistory {
    /** @type {Array<ChatMessageContent>} チャット履歴。 */
    histories = [];

    /**
     * チャット履歴に新しいメッセージを追加します。
     * @param {...ChatMessageContent} contents - 追加するチャットメッセージコンテンツ。
     * @throws {Error} ChatMessageContent のインスタンスでないコンテンツが渡された場合。
     * @returns {ChatMessageContent} 追加された ChatMessageContent オブジェクト。
     */
    append(...contents) {
        if (contents.some(content => !(content instanceof ChatMessageContent))) {
            throw new Error("ChatMessageContent のインスタンスのみが許可されます。");
        }
        this.histories = [...this.histories, ...contents];
        return contents;
    }

    /**
     * ユーザーからの新しいメッセージをチャット履歴に追加します。
     * @param {...(KernelContent|string)} contents - ユーザーメッセージのコンテンツ。
     * @throws {Error} KernelContent のインスタンスでも文字列でもないコンテンツが渡された場合。
     * @returns {ChatMessageContent} 追加された ChatMessageContent オブジェクト。
     */
    appendUser(...contents) {
        return this.#append("user", ...contents);
    }

    /**
     * システムからの新しいメッセージをチャット履歴に追加します。
     * @param {...(KernelContent|string)} contents - システムメッセージのコンテンツ。
     * @throws {Error} KernelContent のインスタンスでも文字列でもないコンテンツが渡された場合。
     * @returns {ChatMessageContent} 追加された ChatMessageContent オブジェクト。
     */
    appendSystem(...contents) {
        return this.#append("system", ...contents);
    }

    /**
     * アシスタントからの新しいメッセージをチャット履歴に追加します。
     * @param {...(KernelContent|string)} contents - アシスタントメッセージのコンテンツ。
     * @throws {Error} KernelContent のインスタンスでも文字列でもないコンテンツが渡された場合。
     * @returns {ChatMessageContent} 追加された ChatMessageContent オブジェクト。
     */
    appendAssistant(...contents) {
        return this.#append("assistant", ...contents);
    }

    /**
     * 指定されたロールとコンテンツでメッセージをチャット履歴に追加するプライベートメソッド。
     * @param {string} role - メッセージのロール（例: "user", "assistant"）。
     * @param {...(KernelContent|string)} contents - メッセージのコンテンツ。
     * @throws {Error} KernelContent のインスタンスでも文字列でもないコンテンツが渡された場合。
     * @returns {ChatMessageContent} 追加された ChatMessageContent オブジェクト。
     */
    #append(role, ...contents) {
        const added = new ChatMessageContent(role, ...contents);
        this.histories.push(new ChatMessageContent(role, ...contents));
        return added;
    }

    /**
     * 指定されたインデックスのチャットメッセージを新しいコンテンツで置き換えます。
     * @param {number} index - 置き換えるメッセージのインデックス。
     * @param {...KernelContent} contents - 新しいチャットメッセージコンテンツ。
     * @throws {Error} インデックスが無効な場合、または ChatMessageContent のインスタンスでないコンテンツが渡された場合。
     */
    replace(/** @type {number} */index, .../** @type {KernelContent[]} */contents) {
        if (index < 0 || index >= this.histories.length) {
            throw new Error("無効なインデックスが指定されました。");
        }
        if (contents.some(content => !(content instanceof KernelContent))) {
            throw new Error("KernelContent のインスタンスのみが許可されます。");
        }
        this.histories[index].items = contents;
    }

    /**
     * 指定されたインデックスのチャットメッセージを削除します。
     * @param {number} index - 削除するメッセージのインデックス。
     * @throws {Error} インデックスが無効な場合。
     */
    delete(/** @type {number} */index) {
        if (index < 0 || index >= this.histories.length) {
            throw new Error("無効なインデックスが指定されました。");
        }
        this.histories.splice(index, 1);
    }

    /**
     * チャット履歴の最後のメッセージを返します。
     * @returns {ChatMessageContent|undefined} 最後の ChatMessageContent オブジェクト、または履歴が空の場合は undefined。
     */
    last() {
        return this.histories.length == 0 ? undefined : this.histories[this.histories.length - 1];
    }

    /**
     * 現在の ChatHistory インスタンスをクローンします。
     * 履歴は指定された範囲でスライスされます。
     * @param {number} [start] - 履歴の開始インデックス。
     * @param {number} [end] - 履歴の終了インデックス (排他的)。
     * @returns {ChatHistory} 新しい ChatHistory インスタンス。
     */
    clone(start, end) {
        const newInstance = new ChatHistory();
        newInstance.histories = this.histories.slice(start, end);
        return newInstance;
    }

}

/**
 * チャットマネージャーのヘルパークラス。
 * ファイル操作やデータURLの解析などのユーティリティメソッドを提供します。
 */
class ChatManagerHelper {
    /**
     * 指定された画像ファイルをData URLに変換します。
     * @param {File} file - Data URLに変換するファイルオブジェクト。
     * @returns {Promise<string>} Data URLに変換されたファイルのPromise。
     */
    static async fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            if (!file || !file.type.startsWith('image/')) {
                reject(new Error('有効な画像ファイルが指定されていません。'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            reader.onerror = (error) => {
                reject(new Error('ファイルの読み込み中にエラーが発生しました: ' + error.target.error));
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Data URLからMIMEタイプとBase64データを抽出します。
     * @param {string} dataURL - 解析するData URL文字列。
     * @returns {{mimetype: string, base64string: string}} MIMEタイプとBase64データを含むオブジェクト。
     * @throws {Error} 無効なData URLが指定された場合。
     */
    static extractDataURLInfo(dataURL) {
        const prefix = 'data:';
        const base64Separator = ';base64,';

        if (!dataURL.startsWith(prefix)) {
            throw new Error('無効なData URL形式です。');
        }

        const mimeTypeEndIndex = dataURL.indexOf(base64Separator, prefix.length);
        const mimetype = dataURL.substring(prefix.length, mimeTypeEndIndex);
        const base64 = dataURL.substring(mimeTypeEndIndex + base64Separator.length);

        if (!mimetype || !base64) {
            throw new Error('無効なData URL形式です。MIMEタイプまたはBase64データが見つかりません。');
        }

        return {
            mimetype: mimetype,
            base64string: base64
        };
    }
}
