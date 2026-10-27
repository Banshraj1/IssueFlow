import axios from "axios";
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
});
export function messageOf(error) {
    return (
        error.response?.data?.error ||
        "Could not connect to IssueFlow. Check the API server and try again."
    );
}
