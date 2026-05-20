import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GestionSinistres } from './gestion-sinistres';

describe('GestionSinistres', () => {
  let component: GestionSinistres;
  let fixture: ComponentFixture<GestionSinistres>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionSinistres],
    }).compileComponents();

    fixture = TestBed.createComponent(GestionSinistres);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
