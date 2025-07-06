/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import {
  AuthType,
  Config,
  clearCachedCredentialFile,
  getErrorMessage,
} from '@genius-ai/gemini-cli-core';

async function performAuthFlow(authMethod: AuthType, config: Config) {
  await config.refreshAuth(authMethod);
  console.log(`通过 "${authMethod}" 认证成功。`);
}

export const useAuthCommand = (
  settings: LoadedSettings,
  setAuthError: (error: string | null) => void,
  config: Config,
) => {
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(
    settings.merged.selectedAuthType === undefined,
  );

  const openAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(true);
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const authFlow = async () => {
      if (isAuthDialogOpen || !settings.merged.selectedAuthType) {
        return;
      }

      try {
        setIsAuthenticating(true);
        await performAuthFlow(
          settings.merged.selectedAuthType as AuthType,
          config,
        );
      } catch (e) {
        let errorMessage = `登录失败。\n消息：${getErrorMessage(e)}`;
        if (
          settings.merged.selectedAuthType ===
            AuthType.LOGIN_WITH_GOOGLE_PERSONAL &&
          !process.env.GOOGLE_CLOUD_PROJECT
        ) {
          errorMessage =
            '登录失败。工作区账户和授权的代码辅助用户必须配置' +
            ` GOOGLE_CLOUD_PROJECT（参见 https://goo.gle/gemini-cli-auth-docs#workspace-gca）。\n消息：${getErrorMessage(e)}`;
        }
        setAuthError(errorMessage);
        openAuthDialog();
      } finally {
        setIsAuthenticating(false);
      }
    };

    void authFlow();
  }, [isAuthDialogOpen, settings, config, setAuthError, openAuthDialog]);

  const handleAuthSelect = useCallback(
    async (authMethod: string | undefined, scope: SettingScope) => {
      if (authMethod) {
        await clearCachedCredentialFile();
        settings.setValue(scope, 'selectedAuthType', authMethod);
      }
      setIsAuthDialogOpen(false);
      setAuthError(null);
    },
    [settings, setAuthError],
  );

  const handleAuthHighlight = useCallback((_authMethod: string | undefined) => {
    // For now, we don't do anything on highlight.
  }, []);

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
  }, []);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    handleAuthHighlight,
    isAuthenticating,
    cancelAuthentication,
  };
};
