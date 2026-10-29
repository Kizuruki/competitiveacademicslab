// Server addresses. MAIN_URL is the History Bowl / Geography Bowl worker (accounts, answers,
// mastered and missed lists). LAB_URL is this lab's own worker (worker/lab-worker.js), which keeps
// each student's progress online. Change LAB_URL if your lab worker has a different address.
export const MAIN_URL = 'https://patient-base-c952.javalutionization.workers.dev';
export const LAB_URL = 'https://competitiveacademicslab.javalutionization.workers.dev';
// accounts that see the coach view and research settings (the lab server checks this too)
export const ADMIN_USERS = ['kizuruki'];
