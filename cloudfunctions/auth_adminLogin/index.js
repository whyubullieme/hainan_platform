// cloudfunctions/auth_adminLogin/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ADMIN_PASSWORD = 'test123';

/**
 * 管理员登录：验证密码后获取/创建 admin 用户
 * 入参: { password, name? }  name 首次创建时必填
 * 出参: { user }
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { errCode: -1, errMsg: '无法获取用户身份信息' };
  }

  const password = event.password && String(event.password).trim();
  if (password !== ADMIN_PASSWORD) {
    return { errCode: -1, errMsg: '密码错误' };
  }

  try {
    const userResult = await db.collection('users').where({ openid }).get();
    const nameVal = event.name != null ? String(event.name).trim() : '';

    let user;

    if (userResult.data && userResult.data.length > 0) {
      user = userResult.data[0];
      await db.collection('users').doc(user._id).update({
        data: {
          role: 'admin',
          updatedAt: db.serverDate(),
          ...(nameVal ? { name: nameVal } : {})
        }
      });
      user.role = 'admin';
      if (nameVal) user.name = nameVal;
    } else {
      if (!nameVal) {
        return { errCode: -1, errMsg: '首次使用请设置姓名' };
      }
      const createResult = await db.collection('users').add({
        data: {
          openid,
          name: nameVal,
          role: 'admin',
          orgName: '',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      user = {
        _id: createResult._id,
        name: nameVal,
        role: 'admin',
        orgName: ''
      };
    }

    delete user.openid;
    return { errCode: 0, errMsg: 'success', user };
  } catch (error) {
    console.error('auth_adminLogin:', error);
    return { errCode: -1, errMsg: error.message || '登录失败' };
  }
};
