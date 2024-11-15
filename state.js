// state.js
let automationStarted = false;
let main_window = null;

module.exports = {
  getAutomationStarted: () => automationStarted,
  setAutomationStarted: (value) => { automationStarted = value; },
  getMainWindow: () => main_window,
  setMainWindow: (window) => { main_window = window; }

};
