import { createContext, useContext, useState, useEffect } from 'react';
import * as api from '../services/api';
import { doctorLoginApi } from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('clinova_token'));
  
  const [doctor, setDoctor] = useState(null);
  const [doctorToken, setDoctorToken] = useState(localStorage.getItem('clinova_doctor_token'));

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await api.getMe();
          setUser(res.data.user);
        } catch (error) {
          localStorage.removeItem('clinova_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const res = await api.login({ email, password });
    localStorage.setItem('clinova_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const register = async (data) => {
    const res = await api.register(data);
    localStorage.setItem('clinova_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('clinova_token');
    setToken(null);
    setUser(null);
  };

  const doctorLogin = async (email, password) => {
    const res = await doctorLoginApi({ email, password });
    localStorage.setItem('clinova_doctor_token', res.data.token);
    setDoctorToken(res.data.token);
    setDoctor(res.data.doctor);
  };

  const doctorLogout = () => {
    localStorage.removeItem('clinova_doctor_token');
    setDoctorToken(null);
    setDoctor(null);
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    doctor,
    doctorToken,
    doctorLogin,
    doctorLogout,
    isDoctorAuthenticated: !!doctorToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

