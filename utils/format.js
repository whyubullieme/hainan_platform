// utils/format.js
/**
 * 格式化工具类
 */

const format = {
    /**
     * 格式化日期
     * @param {Date|string|number} date 日期
     * @param {string} formatStr 格式字符串，默认 'YYYY-MM-DD'
     * @returns {string}
     */
    formatDate(date, formatStr = 'YYYY-MM-DD') {
        if (!date) return '';

        const d = new Date(date);
        if (isNaN(d.getTime())) return '';

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        const second = String(d.getSeconds()).padStart(2, '0');

        return formatStr
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hour)
            .replace('mm', minute)
            .replace('ss', second);
    },

    /**
     * 计算两个日期之间的天数差
     * @param {Date|string} date1 开始日期
     * @param {Date|string} date2 结束日期（默认今天）
     * @returns {number}
     */
    daysBetween(date1, date2 = new Date()) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    },

    /**
     * 格式化时间戳为相对时间
     * @param {Date|string|number} date 日期
     * @returns {string}
     */
    formatRelativeTime(date) {
        if (!date) return '';

        const d = new Date(date);
        const now = new Date();
        const diff = now - d;

        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;

        if (diff < minute) {
            return '刚刚';
        } else if (diff < hour) {
            return `${Math.floor(diff / minute)}分钟前`;
        } else if (diff < day) {
            return `${Math.floor(diff / hour)}小时前`;
        } else if (diff < 7 * day) {
            return `${Math.floor(diff / day)}天前`;
        } else {
            return this.formatDate(d, 'YYYY-MM-DD');
        }
    }
};

module.exports = format;

