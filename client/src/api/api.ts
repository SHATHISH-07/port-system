import axios from "axios";

// Axios instance for API requests
export const api = axios.create({
    baseURL: "http://127.0.0.1:8000",
});