import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: '🥇 Gold Guess — Guess today’s gold close, win the day!',
  });
};
