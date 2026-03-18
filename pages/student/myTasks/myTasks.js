// pages/student/myTasks/myTasks.js
Page({
  goToType(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: `/pages/student/taskList/taskList?type=${type}` });
  }
});
