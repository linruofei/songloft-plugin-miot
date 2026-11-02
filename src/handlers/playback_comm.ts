/// <reference types="@songloft/plugin-sdk" />

import { MinaService } from '../service/service';
import { AccountManager } from '../account/manager';
import { ConfigManager } from '../config/manager';

export function registerPlaybackComm(
  minaService: MinaService,
  accountManager: AccountManager,
  configManager: ConfigManager,
): void {
  // 供其他插件（如小说朗读）获取可用小爱音箱和服务器基础地址
  songloft.comm.onMessage('get-devices', async () => {
    try {
      const accounts = await accountManager.getAccounts();
      const result = [];
      for (const acc of accounts) {
        result.push({
          account_id: acc.id,
          account_name: acc.account,
          devices: await minaService.getDevices(acc.id),
          last_selected_device_id: (await accountManager.getLastSelectedDevice(acc.id)) || '',
        });
      }
      const config = await configManager.getConfig();
      return { success: true, data: result, server_host: config.server_host || '' };
    } catch (e: any) {
      return { success: false, error: String(e) };
    }
  });

  // 供其他插件直接请求播放 URL
  songloft.comm.onMessage('play-url', async (payload: any) => {
    try {
      let accountId = payload?.account_id;
      let deviceId = payload?.device_id;
      const url = payload?.url;

      if (!url) {
        return { success: false, error: 'url is required' };
      }

      // 如果未传账号或设备，自动选取默认活动音箱
      if (!accountId || !deviceId) {
        const accounts = await accountManager.getAccounts();
        if (accounts.length > 0) {
          accountId = accountId || accounts[0].id;
          deviceId = deviceId || (await accountManager.getLastSelectedDevice(accountId)) || accounts[0].devices?.[0]?.device_id;
        }
      }

      if (!accountId || !deviceId) {
        return { success: false, error: 'no active speaker device found' };
      }

      songloft.log.info(`[PlaybackComm] play-url for account=${accountId} device=${deviceId} url=${url}`);
      // 直接调用标准 playURL：自动读取音箱型号，适配 Music API 与 player_play_url，跳过歌词匹配
      const ok = await minaService.playURL(accountId, deviceId, url, payload?.title, undefined, true);
      return { success: ok };
    } catch (e: any) {
      songloft.log.error(`[PlaybackComm] play-url failed: ${String(e)}`);
      return { success: false, error: String(e) };
    }
  });

  // 供其他插件发送控制指令 (pause / resume / stop)
  songloft.comm.onMessage('control', async (payload: any) => {
    try {
      const action = payload?.action;
      let accountId = payload?.account_id;
      let deviceId = payload?.device_id;

      if (!accountId || !deviceId) {
        const accounts = await accountManager.getAccounts();
        if (accounts.length > 0) {
          accountId = accountId || accounts[0].id;
          deviceId = deviceId || (await accountManager.getLastSelectedDevice(accountId));
        }
      }

      if (!accountId || !deviceId) return { success: false, error: 'no speaker device' };

      if (action === 'pause') await minaService.pausePlay(accountId, deviceId);
      else if (action === 'resume') await minaService.resumePlay(accountId, deviceId);
      else if (action === 'stop') await minaService.stopPlay(accountId, deviceId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: String(e) };
    }
  });
}

