import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/app/layout/Layout";
import { HomePage } from "@/features/layout/pages/Home";
import { SearchPage } from "@/features/search/pages/Search";
import { ProductDetailPage } from "@/features/products/pages/ProductDetail";
import { CalculatorPage } from "@/features/calculator/pages/Calculator";
import { OpportunitiesPage } from "@/features/opportunities/pages/Opportunities";
import { FavoritesPage } from "@/features/favorites/pages/Favorites";
import { HistoryPage } from "@/features/history/pages/History";
import { ImportPage } from "@/features/import/pages/Import";
import { LocalCollectorPage } from "@/features/collectors/pages/LocalCollector";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "search", element: <SearchPage /> },
      { path: "product/:id", element: <ProductDetailPage /> },
      { path: "calculator", element: <CalculatorPage /> },
      { path: "opportunities", element: <OpportunitiesPage /> },
      { path: "favorites", element: <FavoritesPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "import", element: <ImportPage /> },
      { path: "collect", element: <LocalCollectorPage /> },
    ],
  },
]);
