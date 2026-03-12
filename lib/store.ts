import { create } from 'zustand'

interface AppState {
  selectedEntityId: string | null
  selectEntity: (id: string | null) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  typeFilters: string[]
  setTypeFilters: (types: string[]) => void
  toggleTypeFilter: (type: string) => void
  sortBy: 'name' | 'connections'
  sortDirection: 'asc' | 'desc'
  setSortBy: (sort: 'name' | 'connections') => void
  toggleSortDirection: () => void
  isSearchOpen: boolean
  setSearchOpen: (open: boolean) => void
  countryFilter: string | null
  setCountryFilter: (country: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedEntityId: null,
  selectEntity: (id) => set({ selectedEntityId: id }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  typeFilters: [],
  setTypeFilters: (types) => set({ typeFilters: types }),
  toggleTypeFilter: (type) =>
    set((state) => ({
      typeFilters: state.typeFilters.includes(type)
        ? state.typeFilters.filter((t) => t !== type)
        : [...state.typeFilters, type],
    })),
  sortBy: 'name',
  sortDirection: 'asc',
  setSortBy: (sort) => set({ sortBy: sort }),
  toggleSortDirection: () =>
    set((state) => ({
      sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
    })),
  isSearchOpen: false,
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  countryFilter: null,
  setCountryFilter: (country) => set({ countryFilter: country }),
}))
