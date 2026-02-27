// cloudfunctions/auth_getOrCreateUser/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 获取或创建用户
 * 从 context 中获取 openid，如果用户不存在则创建
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      errCode: -1,
      errMsg: '无法获取用户身份信息'
    };
  }

  try {
    // 查询用户是否存在
    const userResult = await db.collection('users')
      .where({
        openid: openid
      })
      .get();

    let user;

    if (userResult.data.length > 0) {
      user = userResult.data[0];
      const updateData = {};
      const nameVal = event.name != null ? String(event.name).trim() : '';
      if (nameVal) {
        updateData.name = nameVal;
      } else if (!user.name || !String(user.name).trim()) {
        return { errCode: -1, errMsg: '请提供姓名' };
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = db.serverDate();
        await db.collection('users')
          .doc(user._id)
          .update({
            data: updateData
          });
        
        // 更新返回的用户信息
        Object.assign(user, updateData);
      }
    } else {
      const nameVal = event.name != null ? String(event.name).trim() : '';
      if (!nameVal) {
        return { errCode: -1, errMsg: '请提供姓名' };
      }
      const newUser = {
        openid: openid,
        name: nameVal,
        role: 'student',
        orgName: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      };

      const createResult = await db.collection('users')
        .add({
          data: newUser
        });

      user = {
        _id: createResult._id,
        ...newUser
      };
    }

    const classMemberRes = await db.collection('class_members')
      .where({ userId: user._id, status: 'active' })
      .limit(1)
      .get();
    const hasClass = classMemberRes.data && classMemberRes.data.length > 0;
    const currentClassId = hasClass ? classMemberRes.data[0].classId : null;

    // 移除敏感信息
    delete user.openid;

    return {
      errCode: 0,
      errMsg: 'success',
      userId: user._id,
      role: user.role || 'student',
      hasClass,
      currentClassId,
      user: user
    };
  } catch (error) {
    console.error('获取或创建用户失败:', error);
    
    // 如果是集合不存在的错误，给出更友好的提示
    if (error.errCode === -502005 || error.message.includes('collection not exists')) {
      return {
        errCode: -502005,
        errMsg: '数据库集合不存在，请在云开发控制台创建 users 集合。详细步骤请查看 docs/database_setup.md'
      };
    }
    
    return {
      errCode: -1,
      errMsg: error.message || '操作失败'
    };
  }
};

