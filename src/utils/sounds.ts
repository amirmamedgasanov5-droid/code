
export const playSound = (type: 'click' | 'message' | 'notification' | 'success') => {
  const sounds = {
    click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    message: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
    notification: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
    success: 'https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'
  };

  const audio = new Audio(sounds[type]);
  audio.volume = 0.4;
  audio.play().catch(e => console.log("Sound play blocked", e));
};
