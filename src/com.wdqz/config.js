var fs = require('fs');
var util = require('util');
function getConfig() {
    let configFile = __dirname + '/../data/config.json';
    // 检查文件是否存在
    if (!fs.existsSync(configFile)) {
        return '';
    }
    // 读取文件
    let configData = fs.readFileSync(configFile, 'utf8');
    if (util.isNullOrUndefined(configData) || configData === '') {
        return '';
    }
    return JSON.parse(configData);
}

module.exports = {getConfig};