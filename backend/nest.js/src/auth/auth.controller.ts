import { ClassSerializerInterceptor, Controller, ForbiddenException, Get, HttpCode, HttpStatus, ParseArrayPipe, Post, Req, Res, UnauthorizedException, UseGuards, UseInterceptors } from '@nestjs/common';
import { Request, Response } from 'express';
import axios from 'axios';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guard';
import { JwtService } from '@nestjs/jwt';
import { UserRequest } from './interfaces/UserRequest.interface';




@Controller("auth")
export class AuthController {
	constructor(private authService: AuthService, private jwtService: JwtService) {}
​
	@Post('42/redirect')
	async redirect(@Res() res: Response, @Req() req: Request) {
		try{
			if (!req.body.code)
				throw new ForbiddenException("42 Request error")
			const postData = {
				grant_type: 'authorization_code',
				client_id: process.env.FT_UID,
				client_secret: process.env.FT_SECRET,
				code: req.body.code,
				redirect_uri: process.env.FRONT_URL
			};
			const url = process.env.FT_API;
			const result = await axios.post(url, postData);
			const headersRequest = { Authorization: 'Bearer ' + result.data.access_token };
			const userInfo = await axios.get(process.env.FT_API_ME, { headers: headersRequest });
			console.log(result.data.access_token);
			const user = await this.authService.UserConnecting(userInfo);
			const auth = await this.authService.findOne(user.id);
			if (user && auth.has_2fa === true)
				res.json({auth: auth,
				}); // il est aussi de basculer sur le bon controller depuis le back
			else if (user)
				res.json({
					auth: auth, //il faut encore créer le token
					user: user,
				});
		}catch(err42){
			throw( new ForbiddenException("Unauthorized"))
		}
	}
}

@Controller('2fa')
@UseInterceptors(ClassSerializerInterceptor)
export class TwoFactorAuthenticationController {
	constructor(	private readonly authService: AuthService,) {}

	@Post('generate')
	@UseGuards(JwtAuthGuard)
	async register(@Res() response: Response, @Req() request: Request) {
		const { otpauthUrl } = await this.authService.generateTFASecret(request.body.user_id);
		return this.authService.QrCodeStream(response, otpauthUrl);
	}

	@Post('enable')
	@UseGuards(JwtAuthGuard)
	async enableTFA(@Req() req: UserRequest) {
		const valid_code = this.authService.TFACodeValidation(
			req.user.twofa, req.user);
		if (!valid_code)
			throw new UnauthorizedException('Wrong authentification code');
		await this.authService.enableTFA(req.user.user_id)
	}

	@Post('authenticate')
	@HttpCode(200)
	@UseGuards(JwtAuthGuard)
	async authenticate(@Req() req: UserRequest, @Res() res: Response) {
		const isCodeValid = this.authService.TFACodeValidation(
			req.user.twofa, req.user);
		if (!isCodeValid) {
		throw new UnauthorizedException('Wrong authentication code');
		}
		const auth = await this.authService.findOne(req.user.user_id);
		auth.token = await this.authService.createTFAToken(req.user.user_id);
		res.json({
			auth: auth,
			user: this.authService.UserConnectingTFA(req.user.user_id),
		});
	}
}


