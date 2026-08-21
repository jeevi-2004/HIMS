import toast from 'react-hot-toast';

export const notificationService = {
  notify: (message, type = 'info') => {
    switch (type) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      default:
        toast(message);
    }
  }
};

export default notificationService;
