Component({
  properties: {
    currentPage: { type: Number, value: 1 },
    totalPages:  { type: Number, value: 1 }
  },
  methods: {
    onPrev() {
      if (this.properties.currentPage <= 1) return;
      this.triggerEvent('change', { page: this.properties.currentPage - 1 });
    },
    onNext() {
      if (this.properties.currentPage >= this.properties.totalPages) return;
      this.triggerEvent('change', { page: this.properties.currentPage + 1 });
    }
  }
});
