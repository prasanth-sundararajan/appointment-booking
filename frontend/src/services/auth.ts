import { env } from '@/lib/env';
import type { LoginRequest, Me, ProfileUpdate, RegisterRequest, TokenResponse, User } from '@/types';
import { get, patch, post, setAccessToken } from './api';

export const authService = {
  async login(payload: LoginRequest): Promise<TokenResponse> {
    const form = new URLSearchParams();
    form.append('username', payload.email);
    form.append('password', payload.password);
    const data = await post<TokenResponse, URLSearchParams>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    setAccessToken(data.access_token);
    return data;
  },

  register(payload: RegisterRequest): Promise<User> {
    return post<User, RegisterRequest>('/auth/register', payload);
  },

  async logout(): Promise<void> {
    try {
      await post<void>('/auth/logout');
    } finally {
      setAccessToken(null);
    }
  },

  me(): Promise<Me> {
    return get<Me>('/auth/me');
  },

  /** PATCH /auth/me (profile edit) */
  updateMe(payload: ProfileUpdate): Promise<User> {
    return patch<User, ProfileUpdate>('/auth/me', payload);
  },

  becomeOwner(): Promise<User> {
    return post<User>('/auth/me/become-owner');
  },

  googleLoginUrl(): string {
    return `${env.apiUrl}/auth/google`;
  },
};
