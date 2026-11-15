import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoginPage from '../pages/LoginPage'
import AuctionListingPage from '../pages/AuctionListingPage'
import AuctionDetailPage from '../pages/AuctionDetailPage'
import CreateRfqPage from '../pages/CreateRfqPage'
import AppShell from './AppShell'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<AuctionListingPage />} />
          <Route path="auctions" element={<AuctionListingPage />} />
          <Route path="auctions/:id" element={<AuctionDetailPage />} />
          <Route path="create" element={<CreateRfqPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
