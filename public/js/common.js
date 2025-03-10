// 获取js-tag变量，用于区分加载本js文件的页面
var jsTagPage = document.getElementById('commonjs').getAttribute('page');

// 获取当前项目的根路径
var getRootPath = function (){
    //pathName:--->   mbuy/user/login.action
    let pathName = window.location.pathname.substring(1);
    //webName:--->mbuy
    let webName = pathName === '' ? '' : pathName.substring(0, pathName.indexOf('/'));
    let host = window.location.protocol + '//' + (window.location.host + '/'+ webName + '/').replace('//', '');
    return host;
};

// 加载其他js文件
var loadJs = function (file) {
    let js = getRootPath() + 'js/' + file;
    var head = $('head').remove('#load-script');
    $("<scri"+"pt>"+"</scr"+"ipt>").attr({src:js,type:'text/javascript',id:'load-script'}).appendTo(head);
}

// 删除html标签
var stripHtmlTags = function (html) {
    return html.replace(/(<([^>]+)>)/ig, '');
}

// 判断字符串是否是json
var isJson = function (s) {
    if (typeof s != 'string') {
        return false;
    }
    try {
        let obj = JSON.parse(s);
        if (typeof obj == 'object' && obj) {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// 数字千分位处理
var numericFormat = function (n) {
    if (n === null || n === undefined || isNaN(n)) {
        return n;
    }
    return n.toString().replace(/(\d{1,3})(?=(\d{3})+(?:$|\.))/g,'$1,');
}

// 四舍五入
Number.prototype._toFixed = Number.prototype.toFixed
Number.prototype.toFixed = function (n = 2) {
    let temp = (this + '').split('.')
    if (!temp[1] || temp[1].length <= n) {
        return this._toFixed(n)
    } else {
        let nlast = temp[1].substring(n, n + 1)
        temp[1] = temp[1].substring(0, n) + (nlast >= 5 ? '9' : '1')
        return Number([temp[0], temp[1]].join('.'))._toFixed(n)
    }
}

//判断是否是手机
var IsMobile = function () {
    let isMobile = {
        Android: function () {
            return navigator.userAgent.match(/Android/i) ? true : false;
        },
        BlackBerry: function () {
            return navigator.userAgent.match(/BlackBerry/i) ? true : false;
        },
        iOS: function () {
            return navigator.userAgent.match(/iPhone|iPod/i) ? true : false;
        },
        Windows: function () {
            return navigator.userAgent.match(/IEMobile/i) ? true : false;
        },
        any: function () {
            return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Windows());
        }
    };
    return isMobile.any(); //是移动设备
}

// 复制函数
// 针对html指定元素内容
async function copyContent(copyAreaId) {
    try {
        if (copyAreaId === undefined || copyAreaId === null || copyAreaId === '') {
            copyAreaId = 'copy_area';
        }
        let copyArea = $('#'+copyAreaId).html();
        if (copyArea === null || copyArea === '') {
            layer.msg('没有设置复制区域', {time:false});
            return false;
        }
        await navigator.clipboard.writeText(escapeHtml(copyArea));
        layer.msg('复制成功!');
        console.log('Content copied to clipboard');
        return true;
        /* Resolved - 文本被成功复制到剪贴板 */
    } catch (err) {
        console.error('Failed to copy: ', err);
        /* Rejected - 文本未被复制到剪贴板 */
    }
}

// 复制函数
// 可以复制指定字符串，字符串通过参数传入
async function copyString(content, callback) {
    try {
        if (content === undefined || content === null || content === '') {
            layer.msg('要复制的内容为空!');
            return false;
        }
        await navigator.clipboard.writeText(escapeHtml(content));
        if (callback) {
            callback();
            return true;
        }
        layer.msg('复制成功!');
        return true;
        /* Resolved - 文本被成功复制到剪贴板 */
    } catch (err) {
        console.error('Failed to copy: ', err);
        /* Rejected - 文本未被复制到剪贴板 */
    }
}

function escapeHtml(html) {
    return html
        .replace(/&lt;/g,"<")
        .replace(/&gt;/g,">");
}


// 优化localStorage函数，解决不能直接直接操作对象问题
var setStorage = function (k, v) {
    if (typeof v == 'object') {
        v = JSON.stringify(v);
    }
    localStorage.setItem(k, v);
};
var getStorage = function (k, func) {
    let v = localStorage.getItem(k);
    if (isJson(v)) {
        v = JSON.parse(v);
    }
    if (func) {
        func(v);
    }
    return v;
}

var delStorage = function (k) {
    localStorage.removeItem(k);
}

// 封装post函数
var post = function (path, data, func, eFunc) {
    //let loading = openLoading(path);
    $.ajax({
        url : window.host + path,
        type : 'POST',
        data: data,
        dataType: 'JSON',
        beforeSend: function (req) {
        },
        success: function(r){
            //closeLoading(loading);
            func(r);
        },
        error: function(r){
            //closeLoading(loading);
            if (typeof eFunc === 'function') {
                eFunc(r);
                return true;
            }
            console.log(r);
        }
    });
}

var openLoading = function(path) {
    if (layer === undefined || layer === null || typeof layer.load !== 'function') {
        return false;
    }
    return layer.load(1, {
        shade: [0.5, '#000'],
    });
}

var closeLoading = function(index) {
    if (layer === undefined || layer === null || typeof layer.close !== 'function') {
        return false;
    }
    console.log('close index', index);
    if (index === false || index === null || index === undefined) {
        return false;
    }
    console.log('close index1', index);
    layer.close(index);
}

// 设置全局根目录
window.projectPath = getRootPath();
window.host = window.projectPath;
