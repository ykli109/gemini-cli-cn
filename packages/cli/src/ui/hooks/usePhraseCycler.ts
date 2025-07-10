/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

export const WITTY_LOADING_PHRASES = [
  '今天感觉很幸运',
  '正在传送精彩内容...',
  '正在把字体描边画回来...',
  '正在导航黏菌网络...',
  '正在咨询数字精灵...',
  '正在给 AI 仓鼠热身...',
  '正在询问神奇海螺壳...',
  '正在生成机智回复...',
  '正在擦亮算法...',
  '别催促完美（或我的代码）...',
  '正在酿造新鲜字节...',
  '正在计算电子...',
  '正在启动认知处理器...',
  '正在检查宇宙的语法错误...',
  '稍等，正在优化幽默感...',
  '正在洗牌笑点...',
  '正在解开神经网络...',
  '正在编译辉煌...',
  '正在加载 wit.exe...',
  '正在召唤智慧云...',
  '正在准备机智回应...',
  '稍等，我正在调试现实...',
  '正在混乱选项...',
  '正在调谐宇宙频率...',
  '正在制作值得您等待的回应...',
  '正在编译1和0...',
  '正在解决依赖关系...和存在危机...',
  '正在整理记忆...RAM和个人记忆...',
  '正在重启幽默模块...',
  '正在缓存要点（主要是猫表情包）...',
  '正在运行 sudo 给我做个三明治...',
  '正在优化到荒谬速度',
  '正在交换位...别告诉字节...',
  '正在垃圾回收...马上回来...',
  '正在组装互联网...',
  '正在把咖啡转换成代码...',
  '正在推送到生产环境（并祈祷最好的结果）...',
  '正在更新现实的语法...',
  '正在重新连接突触...',
  '正在寻找丢失的分号...',
  '正在给机器的齿轮加油...',
  '正在预热服务器...',
  '正在校准通量电容器...',
  '正在启动不可能驱动器...',
  '正在引导原力...',
  '正在对齐星星以获得最佳回应...',
  '就这样说...',
  '正在加载下一个伟大想法...',
  '稍等，我在状态中...',
  '正在准备用辉煌让您眼花缭乱...',
  '稍等，我正在擦亮我的机智...',
  '稍等，我正在制作杰作...',
  '稍等，我正在调试宇宙...',
  '稍等，我正在对齐像素...',
  '稍等，我正在优化幽默感...',
  '稍等，我正在调谐算法...',
  '曲速引擎启动...',
  '正在挖掘更多双锂晶体...',
  '船长，我正在尽全力！',
  '别慌张...',
  '正在跟随白兔...',
  '真相就在这里...某个地方...',
  '正在对卡带吹气...',
  '正在另一个城堡里寻找公主...',
  '加载中...做个桶滚！',
  '正在等待重生...',
  '正在用不到12秒差距完成凯塞尔之行...',
  '蛋糕不是谎言，只是还在加载...',
  '正在摆弄角色创建界面...',
  "按'A'继续...",
  '正在放牧数字猫...',
  '正在擦亮像素...',
  '正在寻找合适的加载界面双关语...',
  '用这个机智短语分散您的注意力...',
  '快到了...大概...',
  '我们的仓鼠正在尽快工作...',
  '正在拍拍云朵的头...',
  '正在撸猫...',
  '正在恶作剧老板...',
  '永远不会放弃你，永远不会让你失望...',
  '正在拍低音...',
  '正在品尝雪莓...',
  '我要走完全程，我要全速前进...',
  '这是现实生活吗？这只是幻想吗？...',
  '我对此有好感...',
  '正在戳熊...',
  '正在研究最新表情包...',
  '正在想办法让这更机智...',
  '嗯...让我想想...',
  '你怎么称呼没有眼睛的鱼？fsh...',
  '为什么电脑要去看心理医生？因为它有太多字节...',
  '程序员为什么不喜欢大自然？因为有太多bug...',
  '程序员为什么喜欢深色模式？因为光会吸引虫子...',
  '为什么开发者破产了？因为他用完了所有缓存...',
  '坏掉的铅笔能做什么？什么都做不了，没有意义...',
  '正在应用敲击维护...',
  '正在寻找正确的USB方向...',
  '确保神奇烟雾留在电线里...',
  '正在无缘无故重写为Rust...',
  '正在尝试退出Vim...',
  '正在启动仓鼠轮...',
  '那不是bug，那是未记录的功能...',
  '我会回来...带着答案。',
  '我的另一个进程是TARDIS...',
  '正在与机器精神交流...',
  '让思想腌制...',
  '刚想起我把钥匙放在哪里了...',
  '正在思考水晶球...',
  '我见过你们不会相信的事情...比如真正阅读加载消息的用户。',
  '正在发起深思凝视...',
  '电脑最喜欢的零食是什么？微芯片。',
  '为什么Java开发者戴眼镜？因为他们看不到C#。',
  '正在充电激光...嗖嗖！',
  '正在除以零...开玩笑的！',
  '正在寻找成人监督...我是说，正在处理。',
  '让它发出哔哔声。',
  '正在缓冲...因为连AI也需要片刻。',
  '正在纠缠量子粒子以获得更快响应...',
  '正在擦亮铬...在算法上。',
  '你不开心吗？（正在努力！）',
  '正在召唤代码小精灵...当然是为了帮忙。',
  '正在等待拨号音结束...',
  '正在重新校准幽默测量仪。',
  '我的另一个加载界面更有趣。',
  '我确定某个地方有只猫在键盘上走...',
  '正在增强...增强...仍在加载。',
  '这不是bug，这是加载界面的功能。',
  '你试过关机再开机吗？（是加载界面，不是我。）',
];

export const PHRASE_CHANGE_INTERVAL_MS = 15000;

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (isActive: boolean, isWaiting: boolean) => {
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    WITTY_LOADING_PHRASES[0],
  );
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isWaiting) {
      setCurrentLoadingPhrase('正在等待用户确认...');
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    } else if (isActive) {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
      }
      // Select an initial random phrase
      const initialRandomIndex = Math.floor(
        Math.random() * WITTY_LOADING_PHRASES.length,
      );
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[initialRandomIndex]);

      phraseIntervalRef.current = setInterval(() => {
        // Select a new random phrase
        const randomIndex = Math.floor(
          Math.random() * WITTY_LOADING_PHRASES.length,
        );
        setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[randomIndex]);
      }, PHRASE_CHANGE_INTERVAL_MS);
    } else {
      // Idle or other states, clear the phrase interval
      // and reset to the first phrase for next active state.
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[0]);
    }

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isActive, isWaiting]);

  return currentLoadingPhrase;
};
