/**
 * 認証を処理するクラス
 */
class Auth {
    /** @type {string | undefined} */
    #ticket;
    /** @type {string | undefined} */
    #challenge;

    /**
     * パスフレーズを取得する。
     * @returns {Promise<string>} パスフレーズ
     */
    async getPassPhrase() {
        let passPhrase = window.localStorage.getItem("passPhrase");
        window.localStorage.setItem("passPhrase", passPhrase ??= window.prompt("パスフレーズを入力"));
        return passPhrase;
    }

    /**
     * 認証付きでリクエストを送信する。
     * @param {Request} request リクエスト
     * @returns {Promise<Response>} レスポンス
     */
    async request(request) {
        let response;
        for(let i = 0; i < 3; i++) {
            let newRequest = request.clone();

            if (this.#ticket) {
                const authResponse = await this.#sha256ToBase64(`${await this.getPassPhrase(i)}${this.#ticket}${this.#challenge}`);
                newRequest.headers.set("X-Auth-Ticket", this.#ticket);
                newRequest.headers.set("X-Auth-Response", authResponse);
            }
            response = await fetch(newRequest);
            this.#ticket = response.headers.get("X-Auth-Ticket") ?? this.#ticket;
            this.#challenge = response.headers.get("X-Auth-Challenge") ?? this.#challenge;
            if (response.status != 401) {
                return response;
            }

            // 401 Unauthorized

            const authResponse = await this.#sha256ToBase64(`${await this.getPassPhrase(i)}${this.#ticket}${this.#challenge}`);
            newRequest = request.clone();
            newRequest.headers.set("X-Auth-Ticket", this.#ticket);
            newRequest.headers.set("X-Auth-Response", authResponse);
            response = await fetch(newRequest);
            this.#ticket = response.headers.get("X-Auth-Ticket") ?? this.#ticket;
            this.#challenge = response.headers.get("X-Auth-Challenge") ?? this.#challenge;
            if (response.status != 401) {
                return response;
            }
            
            // 401 Unauthorized

            await this.#fail();
        }
        return response;
    }

    /**
     * メッセージをSHA256でハッシュ化し、Base64エンコードする。
     * @param {string} message メッセージ
     * @returns {Promise<string>} Base64エンコードされたハッシュ値
     */
    async #sha256ToBase64(message) {
        const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
        const binaryString = String.fromCharCode.apply(null, new Uint8Array(hashBuffer));
        return btoa(binaryString);
    }

    /**
     * 認証失敗時の処理
     * @returns {Promise<void>}
     */
    async #fail() {
        window.localStorage.removeItem("passPhrase");
    }
}
