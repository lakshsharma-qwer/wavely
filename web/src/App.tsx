import { Link, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import Album from "./pages/Album";
import Artist from "./pages/Artist";
import { LibraryPage, Liked, PlaylistPage } from "./pages/Collections";
import Home from "./pages/Home";
import Queue from "./pages/Queue";
import Search from "./pages/Search";

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="t-head text-2xl">Page not found</p>
      <Link to="/" className="mt-6 inline-block rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-glass">
        Go home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="album/:id" element={<Album />} />
        <Route path="artist/:id" element={<Artist />} />
        <Route path="liked" element={<Liked />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="queue" element={<Queue />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
