// services/api.js
/**
 * 云函数调用封装
 */

/**
 * 调用云函数
 * @param {string} name 云函数名称
 * @param {object} data 参数
 * @returns {Promise}
 */
function callCloudFunction(name, data = {}) {
    return new Promise((resolve, reject) => {
        wx.cloud.callFunction({
            name: name,
            data: data,
            success: res => {
                const result = res.result;
                if (!result) {
                    reject(new Error('云函数未返回数据'));
                    return;
                }
                // 兼容 result 为 JSON 字符串的情况
                const obj = typeof result === 'string' ? (() => { try { return JSON.parse(result); } catch (e) { return {}; } })() : result;
                if (obj.errCode && obj.errCode !== 0) {
                    reject(new Error(obj.errMsg || '请求失败'));
                } else {
                    resolve(obj);
                }
            },
            fail: err => {
                const msg = (err && (err.errMsg || err.message)) || '云函数调用失败';
                console.error('云函数调用失败:', name, err);
                reject(new Error(String(msg)));
            }
        });
    });
}

module.exports = {
    callCloudFunction
};

