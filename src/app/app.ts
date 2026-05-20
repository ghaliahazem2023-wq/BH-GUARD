import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router'; // <--- Lezem hathi tkoun mawjouda

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet], // <--- W hathi zeda
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {
  title = 'bh-guard';
}