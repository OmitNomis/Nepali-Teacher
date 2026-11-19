import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { RequireAdmin, Shell } from "./components/Shell";
import { PageLoader } from "./components/ui";
import { useMe } from "./lib/queries";
import { AdminChapter } from "./pages/admin/AdminChapter";
import { AdminChapters } from "./pages/admin/AdminChapters";
import { Progress } from "./pages/admin/Progress";
import { RecordQueue } from "./pages/admin/RecordQueue";
import { Account } from "./pages/Account";
import { Call } from "./pages/learn/Call";
import { ChapterView } from "./pages/learn/ChapterView";
import { Home } from "./pages/learn/Home";
import { Review } from "./pages/learn/Review";
import { Login } from "./pages/Login";

const router = createBrowserRouter([
  // full-screen, no tab bar: a quiz is a focused moment
  { path: "/review", element: <Review /> },
  { path: "/call", element: <Call /> },
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
          { path: "/admin/progress", element: <Progress /> },
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
