import axios from 'axios';

const api = axios.create({
  baseURL: process.env.VITE_API_URL || 'http://localhost:3000',
});

export default {
  getTeachers() {
    return api.get('/teachers');
  },
  getCourses() {
    return api.get('/courses');
  }
};