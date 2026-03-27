// pages/student/myTasks/myTasks.js
const studentService = require('../../../services/student');

Page({
  data: {
    activeTab: 'types',       // 'types' | 'dialogue_history'
    dialogueSessions: [],
    dialogueLoading: false,
    dialogueError: ''
  },

  onShow() {
    // Refresh dialogue history if the tab is already active
    if (this.data.activeTab === 'dialogue_history') {
      this.loadDialogueSessions();
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'dialogue_history' && this.data.dialogueSessions.length === 0) {
      this.loadDialogueSessions();
    }
  },

  goToType(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: `/pages/student/taskList/taskList?type=${type}` });
  },

  async loadDialogueSessions() {
    this.setData({ dialogueLoading: true, dialogueError: '' });
    try {
      const res = await studentService.getDialogueSessions({});
      const sessions = (res.sessions || []).map((s) => {
        // Format date for display
        let dateStr = '';
        if (s.createdAt) {
          const d = new Date(s.createdAt);
          if (!Number.isNaN(d.getTime())) {
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            dateStr = `${month}-${day} ${hours}:${minutes}`;
          }
        }
        // Display score: prefer finalScore, fall back to totalScore
        const displayScore = s.finalScore != null ? s.finalScore : (s.totalScore != null ? s.totalScore : '--');
        return {
          ...s,
          dateStr,
          displayScore,
          passedText: s.passed ? '通过' : '未通过',
          passedClass: s.passed ? 'badge-pass' : 'badge-fail'
        };
      });
      this.setData({ dialogueSessions: sessions });
    } catch (error) {
      console.error('loadDialogueSessions error:', error);
      this.setData({ dialogueError: error.message || '加载失败' });
    } finally {
      this.setData({ dialogueLoading: false });
    }
  }
});
