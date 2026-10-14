
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://mafia-jdx6.onrender.com" ||"http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export default api;

