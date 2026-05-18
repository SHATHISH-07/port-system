import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "../api/api";

interface User {
    id: number;
    username: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isLoading: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const logout = () => {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
    };

    useEffect(() => {
        const fetchUser = async () => {
            if (token) {
                try {
                    const response = await api.get("/auth/me");
                    setUser(response.data);
                } catch (error) {
                    console.error("Session expired or invalid", error);
                    logout();
                }
            }
            setIsLoading(false);
        };
        fetchUser();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem("token", newToken);
        setToken(newToken);
        setUser(newUser);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
