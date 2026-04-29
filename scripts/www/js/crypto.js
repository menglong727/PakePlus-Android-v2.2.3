/**
 * 加密模块 - 使用AES加密敏感数据
 * 使用CryptoJS库进行AES加密解密
 */
const CryptoUtil = (() => {
    // 默认加密密钥（实际应用中应该从用户设置中获取）
    let encryptionKey = null;
    
    /**
     * 初始化加密密钥
     * @param {string} userKey - 用户提供的密钥
     */
    function initKey(userKey) {
        encryptionKey = userKey || generateDefaultKey();
        // 将密钥存储到localStorage（仅存储密钥的哈希值用于验证）
        const keyHash = CryptoJS.SHA256(encryptionKey).toString();
        localStorage.setItem('salary_key_hash', keyHash);
    }
    
    /**
     * 生成默认加密密钥
     * @returns {string} 默认密钥
     */
    function generateDefaultKey() {
        // 基于设备和浏览器的特征生成密钥
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('browser fingerprint', 2, 2);
        
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL()
        ].join('|');
        
        return CryptoJS.SHA256(fingerprint).toString().substring(0, 32);
    }
    
    /**
     * 加密数据
     * @param {any} data - 要加密的数据
     * @returns {string} 加密后的字符串
     */
    function encrypt(data) {
        if (!encryptionKey) {
            initKey();
        }
        
        try {
            const jsonStr = JSON.stringify(data);
            const encrypted = CryptoJS.AES.encrypt(jsonStr, encryptionKey, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            return encrypted.toString();
        } catch (error) {
            console.error('加密失败:', error);
            throw new Error('数据加密失败');
        }
    }
    
    /**
     * 解密数据
     * @param {string} encryptedData - 加密的字符串
     * @returns {any} 解密后的数据
     */
    function decrypt(encryptedData) {
        if (!encryptionKey) {
            initKey();
        }
        
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
            return JSON.parse(decryptedStr);
        } catch (error) {
            console.error('解密失败:', error);
            throw new Error('数据解密失败，请检查加密密钥');
        }
    }
    
    /**
     * 验证密钥是否正确
     * @param {string} testKey - 要验证的密钥
     * @returns {boolean} 密钥是否正确
     */
    function verifyKey(testKey) {
        const storedHash = localStorage.getItem('salary_key_hash');
        if (!storedHash) return true; // 如果没有存储的哈希，说明是首次使用
        
        const testHash = CryptoJS.SHA256(testKey).toString();
        return testHash === storedHash;
    }
    
    /**
     * 更改加密密钥
     * @param {string} oldKey - 旧密钥
     * @param {string} newKey - 新密钥
     * @param {Array} allRecords - 所有需要重新加密的记录
     * @returns {Array} 重新加密后的记录
     */
    function changeKey(oldKey, newKey, allRecords) {
        // 使用旧密钥解密
        encryptionKey = oldKey;
        const decryptedRecords = allRecords.map(record => {
            if (record.encrypted) {
                return decrypt(record.data);
            }
            return record;
        });
        
        // 使用新密钥加密
        encryptionKey = newKey;
        initKey(newKey); // 更新存储的密钥哈希
        
        return decryptedRecords.map(record => ({
            ...record,
            encrypted: true,
            data: encrypt(record)
        }));
    }
    
    /**
     * 检查是否已初始化
     * @returns {boolean}
     */
    function isInitialized() {
        return encryptionKey !== null;
    }
    
    // 公开API
    return {
        initKey,
        encrypt,
        decrypt,
        verifyKey,
        changeKey,
        isInitialized,
        generateDefaultKey
    };
})();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoUtil;
}
