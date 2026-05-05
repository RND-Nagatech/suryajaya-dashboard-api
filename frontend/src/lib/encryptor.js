export class Encryptor {
    constructor(encKey, keyGen) {
        this.encKeyDec = "B3r4sput1h";
    }
    encryptascii(str) {
        // const key = coreKey.decryptEncKey(this.encKey);
        const key = this.encKeyDec;
        const dataKey = {};
        for (let i = 0; i < key.length; i++) {
            dataKey[i] = key.substr(i, 1);
        }

        let strEnc = "";
        let nkey = 0;
        const jml = str.length;

        for (let i = 0; i < parseInt(jml); i++) {
            strEnc =
                strEnc +
                this.hexEncode(str[i].charCodeAt(0) + dataKey[nkey].charCodeAt(0));

            if (nkey === Object.keys(dataKey).length - 1) {
                nkey = 0;
            }
            nkey = nkey + 1;
        }
        return strEnc.toUpperCase();
    }

    decryptascii(str) {
        if (str) {
            // const key = coreKey.decryptEncKey(this.encKey);
            const key = this.encKeyDec;
            const dataKey = {};
            for (let i = 0; i < key.length; i++) {
                dataKey[i] = key.substr(i, 1);
            }

            let strDec = "";
            let nkey = 0;
            const jml = str.length;
            let i = 0;
            while (i < parseInt(jml)) {
                strDec =
                    strDec +
                    this.chr(this.hexdec(str.substr(i, 2)) - dataKey[nkey].charCodeAt(0));
                if (nkey === Object.keys(dataKey).length - 1) {
                    nkey = 0;
                }
                nkey = nkey + 1;
                i = i + 2;
            }
            return strDec;
        }
    }

    hexEncode(str) {
        let result = "";
        result = str.toString(16);
        return result;
    }

    hexdec(hex) {
        let str = "";
        str = parseInt(hex, 16);
        return str;
    }

    chr(asci) {
        let str = "";
        str = String.fromCharCode(asci);
        return str;
    }

    writeLocal(nama, data) {
        this.doEncrypt(data, ["kode_baki", "nama_baki", "kode_barang"]);
        // return localStorage.setItem(nama, encryptascii(JSON.stringify(data)));
    }

    doEncrypt(dataBeforeCopy, ignore = []) {
        if (!dataBeforeCopy) {
            return dataBeforeCopy;
        }
        if (
            typeof dataBeforeCopy === "object" &&
            !(dataBeforeCopy instanceof Date)
        ) {
            const data = Array.isArray(dataBeforeCopy)
                ? [...dataBeforeCopy]
                : { ...dataBeforeCopy };
            Object.keys(data).map((x) => {
                const result = ignore.find((find) => find === x);
                if (!result) {
                    if (Array.isArray(data[x])) {
                        data[x] = data[x].map((y, i) => {
                            if (typeof y === "string") {
                                return this.encryptascii(y);
                            } else if (
                                typeof data[x] === "object" &&
                                data[x] &&
                                !(data[x] instanceof Date)
                            ) {
                                return this.doEncrypt(y, ignore);
                            }
                            return false;
                        });
                    } else {
                        if (typeof data[x] === "string" && data[x]) {
                            data[x] = this.encryptascii(data[x]);
                        } else if (typeof data[x] === "number" && data[x]) {
                            // Call Masking Number
                        } else if (
                            typeof data[x] === "object" &&
                            data[x] &&
                            !(dataBeforeCopy instanceof Date)
                        ) {
                            data[x] = this.doEncrypt(data[x], ignore);
                        }
                    }
                }
                return false;
            });
            return data;
        } else if (typeof dataBeforeCopy === "string") {
            const data = this.encryptascii(dataBeforeCopy);
            return data;
        }
    }

    doDecrypt(dataBeforeCopy, ignore = []) {
        if (!dataBeforeCopy) {
            return dataBeforeCopy;
        }

        if (
            typeof dataBeforeCopy === "object" &&
            !(dataBeforeCopy instanceof Date)
        ) {
            const data = Array.isArray(dataBeforeCopy)
                ? [...dataBeforeCopy]
                : { ...dataBeforeCopy };
            Object.keys(data).map((x) => {
                const result = ignore.find((find) => find === x);
                if (!result) {
                    if (Array.isArray(data[x])) {
                        data[x] = data[x].map((y, i) => {
                            if (typeof y === "string") {
                                return this.decryptascii(y);
                            } else if (
                                typeof data[x] === "object" &&
                                data[x] &&
                                !(data[x] instanceof Date)
                            ) {
                                return this.doDecrypt(y, ignore);
                            }
                            return false;
                        });
                    } else {
                        // Real Encrypt
                        if (typeof data[x] === "string" && data[x]) {
                            data[x] = this.decryptascii(data[x]);
                        } else if (typeof data[x] === "number" && data[x]) {
                            // Call Unmasking Number()
                        } else if (
                            typeof data[x] === "object" &&
                            data[x] &&
                            !(dataBeforeCopy instanceof Date)
                        ) {
                            data[x] = this.doDecrypt(data[x], ignore);
                        }
                    }
                }
                return false;
            });
            return data;
        } else if (typeof dataBeforeCopy === "string") {
            const data = this.decryptascii(dataBeforeCopy);
            return data;
        }
    }

    doDecryptMiddleware() {
        return [
            (req, res, next) => {
                const isEnc = Number(req.headers.enc || "0");
                const ignoreFields = JSON.parse(req.headers.ignore || "[]");
                if (isEnc) {
                    req.body = this.doDecrypt(req.body, ignoreFields);
                    next();
                } else {
                    next();
                }
            }
        ];
    }

    maskingNumber(number) {
        const numberString = String(number);
        const list = numberString.split("");
        return Number(
            list
                .map((data) => {
                    if (data === ".") {
                        return ".";
                    } else {
                        return String(Number(data) + 22);
                    }
                })
                .join("")
        );
    }

    unmaskingNumber(number) {
        const numberString = String(number);
        const list = numberString.split(".");
        return Number(
            list
                .map((data) => {
                    const segment = data.split("").reduce((s, c) => {
                        const l = s.length - 1;
                        s[l] && s[l].length < 2 ? (s[l] += c) : s.push(c);
                        return s;
                    }, []);
                    return segment
                        .map((x) => {
                            return x - 22;
                        })
                        .join("");
                })
                .join(".")
        );
    }

    matchKeygen() {
        const machineId = machineIdSync({ original: true });
        return coreKey.verifyKeygen(machineId, this.encKey, this.keyGen);
    }
}
