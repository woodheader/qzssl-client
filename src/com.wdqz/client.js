var util = require('util');
var fs = require('fs');
var WebSocket = require('ws');
const chokidar = require('chokidar');
const lockfile = require('lockfile');

// 配置文件
var configPath = __dirname + '/../data/config.json';

// 域名数据文件
var domainDataPath = __dirname + '/../data/domain.json';

// 日志文件
var sysLogPath = __dirname + '/../data/log.json';

/**
 * 保存AppId和AppToken
 */
function saveConfig(appId, appToken) {
    if (util.isNullOrUndefined(appId) || appId === '') {
        return {
            code: 30000,
            msg: 'AppId不能为空!',
            resultObject: []
        };
    }
    if (util.isNullOrUndefined(appToken) || appToken === '') {
        return {
            code: 30000,
            msg: 'AppToken不能为空!',
            resultObject: []
        };
    }
    // 配置文件路径
    // 检查文件是否存在，不存在就创建
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, '', 'utf8');
    }
    // 读取文件，当文件为空时，保存成功后，执行一次查询和办理
    let data = {
        app_id: appId,
        app_token: appToken,
    };
    // 写文件
    fs.writeFileSync(configPath, JSON.stringify(data), 'utf8');
    return {
        code: 10000,
        msg: '保存配置成功',
        resultObject: []
    }
}

/**
 * 获取域名列表
 */
function getDomainList(domain, page, pagesize)
{
    // 检查文件是否存在
    if (!fs.existsSync(domainDataPath)) {
        return {
            code: 30000,
            msg: '数据文件不存在!',
            resultObject: []
        };
    }
    // 读取数据文件
    let domainData = fs.readFileSync(domainDataPath, 'utf8');
    if (domainData === null || domainData === '') {
        domainData = '[]';
    }
    let domainList = JSON.parse(domainData);
    if (domain !== '' && domain !== null && domain !== undefined) {
        let searchList = [];
        domainList.forEach((item, index) => {
            if (item.host.includes(domain)) {
                searchList.push(item);
            }
        })
        domainList = searchList;
    }

    // 分页前数据总条数
    let totalNumber = domainList.length;

    // 分页
    let offset = (page - 1) * pagesize;
    let pageDomainList = domainList.slice(offset, parseInt(offset) + parseInt(pagesize));

    return {
        code: 10000,
        msg: 'success',
        resultObject: {
            count: totalNumber,
            list: pageDomainList
        }
    };
}

/**
 * 保存域名
 */
function saveDomain(host, txt_dir, ssl_certificate, ssl_certificate_key, saveType)
{
    if (util.isNullOrUndefined(host) || host === '') {
        return {
            code: 30000,
            msg: '域名不能为空!',
            resultObject: []
        };
    }
    if (util.isNullOrUndefined(txt_dir) || txt_dir === '') {
        return {
            code: 30000,
            msg: 'TXT验证文件目录不能为空!',
            resultObject: []
        };
    }
    if (util.isNullOrUndefined(ssl_certificate) || ssl_certificate_key === '') {
        return {
            code: 30000,
            msg: '证书pem文件完整路径不能为空!',
            resultObject: []
        };
    }
    if (util.isNullOrUndefined(ssl_certificate_key) || ssl_certificate_key === '') {
        return {
            code: 30000,
            msg: '证书key文件完整路径不能为空!',
            resultObject: []
        };
    }
    // 检查文件是否存在，不存在就创建
    if (!fs.existsSync(domainDataPath)) {
        fs.writeFileSync(domainDataPath, '', 'utf8');
    }
    // 读取文件
    let data = fs.readFileSync(domainDataPath, 'utf8');
    if (util.isNullOrUndefined(data) || data === '') {
        data = '[]';
    }
    let domainList = JSON.parse(data);
    let hasDomain = false;
    let itemIndex = -1;
    domainList.forEach((item, index) => {
        // domain存在，则更新其他数据
        if (item.host === host) {
            // 如果是添加域名，这里退出循环
            if (saveType === 'add' || saveType === 'remove' || saveType === 'close' || saveType === 'open') {
                itemIndex = index
                hasDomain = true;
                return false;
            }
            item.txt_dir = txt_dir;
            item.ssl_certificate = ssl_certificate;
            item.ssl_certificate_key = ssl_certificate_key;
            hasDomain = true;
        }
    });
    // 如果是添加域名，且域名存在，这里抛出错误
    if (hasDomain && saveType === 'add') {
        return {
            code: 30000,
            msg: '域名已经存在!',
            resultObject: []
        }
    }
    // 如果是删除域名，且域名不存在，抛出错误
    if (!hasDomain && (saveType === 'remove' || saveType === 'close' || saveType === 'open')) {
        return {
            code: 30000,
            msg: '域名不存在，操作失败!',
            resultObject: []
        }
    }
    // 如果是删除域名，且域名存在，则直接删除
    if (hasDomain && saveType === 'remove') {
        domainList.splice(itemIndex, 1);
    }
    // 如果是关闭续签，且域名存在，则修改开启状态为关闭
    if (hasDomain && saveType === 'close') {
        domainList.forEach((item, index) => {
            if (index === itemIndex) {
                item.open_status = 'close';
            }
        })
    }
    // 如果是开启续签，且域名存在，则修改开启状态为开启
    if (hasDomain && saveType === 'open') {
        domainList.forEach((item, index) => {
            if (index === itemIndex) {
                item.open_status = 'open';
            }
        })
    }
    if (!hasDomain && saveType === 'add') {
        let newData = {
            host: domain,
            open_status: 'open',
            txt_dir: txt_dir,
            ssl_certificate: ssl_certificate,
            ssl_certificate_key: ssl_certificate_key,
        }
        domainList.unshift(newData);
    }
    // 回写
    fs.writeFileSync(domainDataPath, JSON.stringify(domainList), 'utf8');
    return {
        code: 10000,
        msg: '保存域名成功',
        resultObject: []
    }
}

/**
 * 回显配置
 * @returns {{code: number, msg: string, resultObject: any}|{code: number, msg: string, resultObject: *[]}}
 */
function configInfo()
{
    // 检查文件是否存在
    if (!fs.existsSync(configPath)) {
        return {
            code: 30000,
            msg: '配置文件不存在!',
            resultObject: []
        };
    }
    // 读取数据文件
    let configInfo = fs.readFileSync(configPath, 'utf8');
    if (configInfo === null || configInfo === '') {
        configInfo = '[]';
    }
    let configData = JSON.parse(configInfo);
    return {
        code: 10000,
        msg: 'success',
        resultObject: {
            ...configData
        }
    };
}

/**
 * 显示系统续签错误日志
 */
function getSystemLog()
{
// 检查文件是否存在
    if (!fs.existsSync(sysLogPath)) {
        return {
            code: 30000,
            msg: '日志文件不存在!',
            resultObject: []
        };
    }
    // 读取数据文件
    let logInfo = fs.readFileSync(sysLogPath, 'utf8');
    if (logInfo === null || logInfo === '') {
        logInfo = '[]';
    }
    let logData = JSON.parse(logInfo);
    return {
        code: 10000,
        msg: 'success',
        resultObject: logData
    };
}



/**
 * ws 实时读取日志文件
 */
function wsReadSyslog()
{
    // WebSocket 服务器配置
    const wss = new WebSocket.Server({ port: 18890 });

    // 存储所有连接的客户端
    const clients = new Set();

    // 广播消息给所有连接的客户端
    function broadcast(message) {
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    // 读取日志文件并发送给客户端
    function sendInitialLog() {
        lockfile.lock(sysLogPath + '.lock', { wait: 1000, retries: 5 }, (err) => {
            if (err) {
                console.error('获取文件锁时出错:', err);
                return;
            }
            fs.readFile(sysLogPath, 'utf8', (err, data) => {
                lockfile.unlock(sysLogPath + '.lock', (unlockErr) => {
                    if (unlockErr) {
                        console.error('释放文件锁时出错:', unlockErr);
                    }
                });
                if (err) {
                    console.error('读取日志文件时出错:', err);
                    return;
                }
                broadcast(data.split('\n').join('<br/>'));
            });
        });
    }

    // 监听文件变化
    const watcher = chokidar.watch(sysLogPath, {
        persistent: true,
        awaitWriteFinish: {
            stabilityThreshold: 200,
            pollInterval: 100
        }
    });

    let lastSize = 0;
    fs.stat(sysLogPath, (err, stats) => {
        if (err) {
            console.error('获取文件初始状态时出错:', err);
            return;
        }
        lastSize = stats.size;
    });

    // 当文件内容发生变化时，发送新增内容给客户端
    watcher.on('change', (path) => {
        setTimeout(() => {
            lockfile.lock(sysLogPath + '.lock', { wait: 1000, retries: 5 }, (err) => {
                if (err) {
                    console.error('获取文件锁时出错:', err);
                    return;
                }
                fs.stat(path, (err, stats) => {
                    if (err) {
                        lockfile.unlock(sysLogPath + '.lock', (unlockErr) => {
                            if (unlockErr) {
                                console.error('释放文件锁时出错:', unlockErr);
                            }
                        });
                        console.error('获取文件状态时出错:', err);
                        return;
                    }
                    const currentSize = stats.size;
                    fs.open(path, 'r', (err, fd) => {
                        if (err) {
                            lockfile.unlock(sysLogPath + '.lock', (unlockErr) => {
                                if (unlockErr) {
                                    console.error('释放文件锁时出错:', unlockErr);
                                }
                            });
                            console.error('打开文件时出错:', err);
                            return;
                        }
                        const buffer = Buffer.alloc(currentSize - lastSize);
                        fs.read(fd, buffer, 0, currentSize - lastSize, lastSize, (err, bytesRead) => {
                            fs.close(fd, () => {});
                            lockfile.unlock(sysLogPath + '.lock', (unlockErr) => {
                                if (unlockErr) {
                                    console.error('释放文件锁时出错:', unlockErr);
                                }
                            });
                            if (err) {
                                console.error('读取文件时出错:', err);
                                return;
                            }
                            const newContent = buffer.toString('utf8', 0, bytesRead);
                            broadcast(newContent.split('\n').join('<br/>').replace('<br/><br/>', '<br/>'));
                            lastSize = currentSize;
                        });
                    });
                });
            });
        }, 200); // 延迟 200 毫秒读取文件
    });

    // 处理 WebSocket 连接
    wss.on('connection', (ws) => {
        clients.add(ws);
        // 发送初始日志内容
        sendInitialLog();

        // 处理客户端断开连接
        ws.on('close', () => {
            clients.delete(ws);
        });
    });

}

module.exports = {saveConfig, getDomainList, saveDomain, configInfo, getSystemLog, wsReadSyslog};