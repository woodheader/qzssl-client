var util = require('util');
var fs = require('fs');
var WebSocket = require('ws');
const chokidar = require('chokidar');

// 配置文件
var configPath = __dirname + '/../data/config.json';

// 域名数据文件
var domainDataPath = __dirname + '/../data/domain.json';

// 日志文件
var sysLogPath = __dirname + '/../data/log.json';

function atomicWriteFileSync(filePath, content) {
    const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
    try {
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, filePath);
    } finally {
        try {
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        } catch (e) {
        }
    }
}

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
    atomicWriteFileSync(configPath, JSON.stringify(data));
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
            msg: '数据文件不存在!(约10分钟左右从QzSSL同步域名数据)',
            resultObject: []
        };
    }
    // 读取数据文件
    let domainData = fs.readFileSync(domainDataPath, 'utf8');
    if (domainData === null || domainData === '') {
        domainData = '[]';
    }
    let domainList;
    try {
        domainList = JSON.parse(domainData);
    } catch (e) {
        return {
            code: 30000,
            msg: '数据文件解析失败，请稍后重试(可能正在同步写入)',
            resultObject: []
        };
    }
    if (!Array.isArray(domainList)) domainList = [];
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
    if (util.isNullOrUndefined(ssl_certificate) || ssl_certificate === '') {
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
    if (!fs.existsSync(domainDataPath)) {
        fs.writeFileSync(domainDataPath, '[]', 'utf8');
    }
    let data = fs.readFileSync(domainDataPath, 'utf8');
    if (util.isNullOrUndefined(data) || data === '') data = '[]';
    let domainList;
    try {
        domainList = JSON.parse(data);
    } catch (e) {
        domainList = [];
    }
    if (!Array.isArray(domainList)) domainList = [];
    let hasDomain = false;
    let itemIndex = -1;
    for (let index = 0; index < domainList.length; index++) {
        const item = domainList[index];
        if (item.host !== host) continue;
        itemIndex = index;
        hasDomain = true;
        if (saveType !== 'add' && saveType !== 'remove' && saveType !== 'close' && saveType !== 'open') {
            item.txt_dir = txt_dir;
            item.ssl_certificate = ssl_certificate;
            item.ssl_certificate_key = ssl_certificate_key;
        }
        break;
    }
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
            host: host,
            open_status: 'open',
            txt_dir: txt_dir,
            ssl_certificate: ssl_certificate,
            ssl_certificate_key: ssl_certificate_key,
        }
        domainList.unshift(newData);
    }
    // 回写
    atomicWriteFileSync(domainDataPath, JSON.stringify(domainList));
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
        configInfo = '{}';
    }
    let configData;
    try {
        configData = JSON.parse(configInfo);
    } catch (e) {
        configData = {};
    }
    if (configData === null || typeof configData !== 'object' || Array.isArray(configData)) {
        configData = {};
    }
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
    if (logInfo === null || logInfo === '') logInfo = '';
    const lines = logInfo.split('\n').map((s) => s.trim()).filter(Boolean);
    const logData = lines.map((line) => {
        const sep = ' - ';
        const idx = line.indexOf(sep);
        if (idx === -1) return { time: '', msg: line };
        return { time: line.slice(0, idx), msg: line.slice(idx + sep.length) };
    });
    return {
        code: 10000,
        msg: 'success',
        resultObject: logData
    };
}



/**
 * ws 实时读取日志文件
 */
function wsReadSyslog(httpServer)
{
    if (!fs.existsSync(sysLogPath)) {
        fs.writeFileSync(sysLogPath, '', 'utf8');
    }
    const LIMITS = {
        maxInitialLines: 500,
        maxInitialBytes: 128 * 1024,
        maxPushLines: 200,
        maxPushBytes: 16 * 1024,
        maxBufferedAmount: 1024 * 1024,
        maxLinesPerFlush: 2000,
    };

    // WebSocket 服务器配置
    const wss = new WebSocket.Server({ server: httpServer });

    // 存储所有连接的客户端
    const clients = new Set();

    function safeSend(ws, message) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > LIMITS.maxBufferedAmount) return;
        ws.send(message);
    }

    function cutByUtf8Bytes(str, maxBytes) {
        if (Buffer.byteLength(str, 'utf8') <= maxBytes) return [str];
        const out = [];
        let start = 0;
        while (start < str.length) {
            let end = start;
            let bytes = 0;
            while (end < str.length) {
                const ch = str[end];
                const chBytes = Buffer.byteLength(ch, 'utf8');
                if (bytes + chBytes > maxBytes) break;
                bytes += chBytes;
                end++;
            }
            if (end === start) end = start + 1;
            out.push(str.slice(start, end));
            start = end;
        }
        return out;
    }

    function chunkLines(lines, maxLines, maxBytes) {
        const chunks = [];
        let cur = [];
        let curBytes = 0;

        const pushCur = () => {
            if (cur.length === 0) return;
            chunks.push(cur);
            cur = [];
            curBytes = 0;
        };

        for (const line of lines) {
            const parts = cutByUtf8Bytes(String(line), maxBytes);
            for (const part of parts) {
                const b = Buffer.byteLength(part, 'utf8');
                if (cur.length + 1 > maxLines || curBytes + b > maxBytes) {
                    pushCur();
                }
                cur.push(part);
                curBytes += b;
            }
        }
        pushCur();
        return chunks;
    }

    function sendLinesToWs(ws, type, lines) {
        const chunks = chunkLines(lines, LIMITS.maxPushLines, LIMITS.maxPushBytes);
        for (const chunk of chunks) {
            safeSend(ws, JSON.stringify({ type, lines: chunk }));
        }
    }

    function broadcastLines(type, lines) {
        const chunks = chunkLines(lines, LIMITS.maxPushLines, LIMITS.maxPushBytes);
        for (const chunk of chunks) {
            const message = JSON.stringify({ type, lines: chunk });
            clients.forEach((client) => safeSend(client, message));
        }
    }

    function shrinkLinesByBytesFromStart(lines, maxBytes) {
        let bytes = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
            bytes += Buffer.byteLength(lines[i], 'utf8');
            if (bytes > maxBytes) return lines.slice(i + 1);
        }
        return lines;
    }

    // 读取日志文件并发送给客户端
    function sendInitialLog(targetWs) {
        fs.stat(sysLogPath, (e1, st) => {
            if (e1 || !st || !st.isFile()) {
                return;
            }
            const size = st.size;
            const readBytes = Math.min(size, LIMITS.maxInitialBytes);
            const offset = size - readBytes;
            fs.open(sysLogPath, 'r', (e2, fd) => {
                if (e2) return;
                const buf = Buffer.alloc(readBytes);
                fs.read(fd, buf, 0, readBytes, offset, (e3, bytesRead) => {
                    fs.close(fd, () => {});
                    if (e3) return;
                    let text = buf.toString('utf8', 0, bytesRead);
                    if (offset > 0) {
                        const p = text.indexOf('\n');
                        if (p !== -1) text = text.slice(p + 1);
                    }
                    let lines = text.split('\n').filter((l) => l !== '');
                    if (lines.length > LIMITS.maxInitialLines) {
                        lines = lines.slice(-LIMITS.maxInitialLines);
                    }
                    sendLinesToWs(targetWs, 'snapshot', lines);
                });
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

    let leftoverLine = '';
    let pendingText = '';
    let flushTimer = null;

    function flushPending() {
        if (!pendingText) return;
        let text = leftoverLine + pendingText;
        pendingText = '';

        const endsWithNewline = text.endsWith('\n');
        let parts = text.split('\n');
        if (!endsWithNewline) {
            leftoverLine = parts.pop() || '';
        } else {
            leftoverLine = '';
        }
        parts = parts.filter((l) => l !== '');
        if (parts.length === 0) return;

        if (parts.length > LIMITS.maxLinesPerFlush) {
            parts = parts.slice(-LIMITS.maxLinesPerFlush);
            parts.unshift('... 日志过多，已截断 ...');
        }
        broadcastLines('append', parts);
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            flushPending();
        }, 120);
    }

    // 当文件内容发生变化时，发送新增内容给客户端
    watcher.on('change', (path) => {
        setTimeout(() => {
            fs.stat(path, (err, stats) => {
                if (err) {
                    console.error('获取文件状态时出错:', err);
                    return;
                }
                const currentSize = stats.size;
                if (currentSize < lastSize) {
                    lastSize = 0;
                    leftoverLine = '';
                    pendingText = '';
                }
                if (currentSize === lastSize) {
                    return;
                }
                fs.open(path, 'r', (err, fd) => {
                    if (err) {
                        console.error('打开文件时出错:', err);
                        return;
                    }
                    const bytesToRead = currentSize - lastSize;
                    const buffer = Buffer.alloc(bytesToRead);
                    fs.read(fd, buffer, 0, bytesToRead, lastSize, (err, bytesRead) => {
                        fs.close(fd, () => {});
                        if (err) {
                            console.error('读取文件时出错:', err);
                            return;
                        }
                        const newContent = buffer.toString('utf8', 0, bytesRead);
                        pendingText += newContent;
                        scheduleFlush();
                        lastSize = currentSize;
                    });
                });
            });
        }, 200); // 延迟 200 毫秒读取文件
    });

    // 处理 WebSocket 连接
    wss.on('connection', (ws) => {
        clients.add(ws);
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        // 发送初始日志内容
        sendInitialLog(ws);

        // 处理客户端断开连接
        ws.on('close', () => {
            clients.delete(ws);
        });
        ws.on('error', () => {
            clients.delete(ws);
        });
    });

    const pingInterval = setInterval(() => {
        clients.forEach((ws) => {
            if (ws.isAlive === false) {
                try {
                    ws.terminate();
                } catch (e) {}
                clients.delete(ws);
                return;
            }
            ws.isAlive = false;
            try {
                ws.ping();
            } catch (e) {
                try {
                    ws.terminate();
                } catch (e2) {}
                clients.delete(ws);
            }
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(pingInterval);
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        try {
            watcher.close();
        } catch (e) {}
    });
}

module.exports = {saveConfig, getDomainList, saveDomain, configInfo, getSystemLog, wsReadSyslog};
