import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { RequireAdmin, Shell } from "./components/Shell";
import { PageLoader } from "./components/ui";
import { useMe } from "./lib/queries";
import { AdminChapter } from "./pages/admin/AdminChapter";
import { AdminChapters } from "./pages/admin/AdminChapters";
import { RecordQueue } from "./pages/admin/RecordQueue";
import { Account } from "./pages/Account";
import { ChapterView } from "./pages/learn/ChapterView";
import { Home } from "./pages/learn/Home";
import { Login } from "./pages/Login";

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/chapters/:id", element: <ChapterView /> },
      { path: "/account", element: <Account /> },
      {
        element: <RequireAdmin />,
        children: [
          { path: "/admin", element: <AdminChapters /> },
          { path: "/admin/chapters/:id", element: <AdminChapter /> },
          { path: "/admin/record", element: <RecordQueue /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  const me = useMe();
  if (me.isPending) return <PageLoader />;
  if (!me.data) return <Login />;
  return <RouterProvider router={router} />;
}
