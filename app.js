// app.js
App({
    onLaunch() {
        // 初始化云开发环境
        if (!wx.cloud) {
            console.error('请使用 2.2.3 或以上的基础库以使用云能力');
        } else {
            wx.cloud.init({
                // env 参数说明：
                //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
                //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
                //   如不填则使用默认环境（第一个创建的环境）
                env: 'cloud1-8ggfiisle5f699cc',
                traceUser: true,
            });
        }

        // 检查登录状态
        this.checkLoginStatus();
    },

    // 检查登录状态并跳转
    checkLoginStatus() {
        // 获取当前页面路径
        const pages = getCurrentPages();
        const currentPage = pages.length > 0 ? pages[pages.length - 1].route : '';

        // 如果当前在登录页或加入班级页，不自动跳转
        if (currentPage === 'pages/auth/login/login' || currentPage === 'pages/auth/joinClass/joinClass') {
            return;
        }

        const userInfo = wx.getStorageSync('userInfo');
        const currentClassId = wx.getStorageSync('currentClassId');

        if (!userInfo) {
            // 未登录，跳转到登录页
            wx.reLaunch({
                url: '/pages/auth/login/login'
            });
        } else if (!currentClassId && userInfo.role !== 'admin') {
            // 已登录但未加入班级（且非 admin），跳转到加入班级页
            wx.reLaunch({
                url: '/pages/auth/joinClass/joinClass'
            });
        } else if (userInfo.role === 'admin' && !currentClassId) {
            // admin 可直接进入管理页
            if (currentPage !== 'pages/admin/classManage/classManage') {
                wx.reLaunch({ url: '/pages/admin/classManage/classManage' });
            }
        } else if (currentClassId) {
            // 已登录且已加入班级，根据角色跳转
            // admin 来自 users.role，学生/教师来自 class_members.roleInClass
            const roleInClass = wx.getStorageSync('roleInClass');
            const isAdmin = userInfo.role === 'admin';

            let homePage = '/pages/student/home/home';
            if (isAdmin) {
                homePage = '/pages/admin/classManage/classManage';
            } else if (roleInClass === 'teacher') {
                homePage = '/pages/teacher/dashboard/dashboard';
            } else {
                homePage = '/pages/student/home/home';
            }

            // 检查当前页面，避免重复跳转
            if (currentPage !== homePage.replace(/^\//, '')) {
                wx.reLaunch({
                    url: homePage
                });
            }
        }
    },

    globalData: {
        userInfo: null,
        currentClassId: null
    }
});

